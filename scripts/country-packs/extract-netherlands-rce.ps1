param(
  [Parameter(Mandatory = $true)]
  [string]$MdbPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$resolvedMdbPath = (Resolve-Path -LiteralPath $MdbPath).Path
if ([IO.Path]::GetExtension($resolvedMdbPath) -ne ".mdb") {
  throw "The RCE source must be an Extract_MRS .mdb file."
}

$resolvedOutputPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [IO.Path]::GetDirectoryName($resolvedOutputPath)
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
  [IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

$connection = New-Object System.Data.OleDb.OleDbConnection(
  "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$resolvedMdbPath;Persist Security Info=False;"
)
$connection.Open()

try {
  $functions = @{}
  $functionCommand = $connection.CreateCommand()
  $functionCommand.CommandText = @"
SELECT OBJ_NUMMER, TFU_OMSCHRIJVING, OFU_IND_HOOFDFUNCTIE
FROM tblOBJECTFUNCTIE
WHERE TFU_OMSCHRIJVING Is Not Null
"@
  $reader = $functionCommand.ExecuteReader()
  try {
    while ($reader.Read()) {
      $objectNumber = [int]$reader[0]
      $description = [string]$reader[1]
      $isPrimary = [string]$reader[2]
      if (-not $functions.ContainsKey($objectNumber) -or $isPrimary -match "^(J|Y|1)$") {
        $functions[$objectNumber] = $description.Trim()
      }
    }
  }
  finally {
    $reader.Close()
  }

  $buildingTypes = @{}
  $buildingCommand = $connection.CreateCommand()
  $buildingCommand.CommandText = @"
SELECT OBJ_NUMMER, TBW_OMSCHRIJVING
FROM tblOBJECTBOUWTYPE
WHERE TBW_OMSCHRIJVING Is Not Null
"@
  $reader = $buildingCommand.ExecuteReader()
  try {
    while ($reader.Read()) {
      $objectNumber = [int]$reader[0]
      if (-not $buildingTypes.ContainsKey($objectNumber)) {
        $buildingTypes[$objectNumber] = ([string]$reader[1]).Trim()
      }
    }
  }
  finally {
    $reader.Close()
  }

  $objects = [Collections.Generic.List[object]]::new()
  $objectCommand = $connection.CreateCommand()
  $objectCommand.CommandText = @"
SELECT OBJ_NUMMER, OBJ_RIJKSNUMMER, OBJ_NAAM, OBJ_X_COORD, OBJ_Y_COORD,
       GEM_NAAM, PLA_NAAM, ADRES, OBJ_IND_TOP100, OCB_OMSCHRIJVING
FROM tblOBJECT
WHERE OBJ_RIJKSNUMMER Is Not Null
  AND OBJ_X_COORD Is Not Null
  AND OBJ_Y_COORD Is Not Null
  AND GEM_NAAM Is Not Null
"@
  $reader = $objectCommand.ExecuteReader()
  try {
    while ($reader.Read()) {
      $objectNumber = [int]$reader[0]
      $objects.Add([ordered]@{
        objectNumber = $objectNumber
        rijksmonumentNumber = [int]$reader[1]
        name = if ($reader.IsDBNull(2)) { "" } else { ([string]$reader[2]).Trim() }
        rdX = [double]$reader[3]
        rdY = [double]$reader[4]
        municipality = ([string]$reader[5]).Trim()
        locality = if ($reader.IsDBNull(6)) { "" } else { ([string]$reader[6]).Trim() }
        address = if ($reader.IsDBNull(7)) { "" } else { ([string]$reader[7]).Trim() }
        top100 = if ($reader.IsDBNull(8)) { $false } else { ([string]$reader[8]) -match "^(J|Y|1)$" }
        protectionType = if ($reader.IsDBNull(9)) { "" } else { ([string]$reader[9]).Trim() }
        function = if ($functions.ContainsKey($objectNumber)) { $functions[$objectNumber] } else { "" }
        buildingType = if ($buildingTypes.ContainsKey($objectNumber)) { $buildingTypes[$objectNumber] } else { "" }
      })
    }
  }
  finally {
    $reader.Close()
  }

  $payload = [ordered]@{
    formatVersion = 1
    extractedAt = [DateTime]::UtcNow.ToString("o")
    sourceFile = [IO.Path]::GetFileName($resolvedMdbPath)
    recordCount = $objects.Count
    records = $objects
  }
  $json = $payload | ConvertTo-Json -Depth 5 -Compress
  [IO.File]::WriteAllText(
    $resolvedOutputPath,
    $json,
    [Text.UTF8Encoding]::new($false)
  )
  Write-Output "Extracted $($objects.Count) geocoded RCE objects to $resolvedOutputPath"
}
finally {
  $connection.Close()
}
