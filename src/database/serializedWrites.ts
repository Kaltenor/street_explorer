import type { SQLiteDatabase } from "expo-sqlite";

/** One writer at a time; ordinary WAL reads remain concurrent. */
export function serializeDatabaseWrites(
  database: SQLiteDatabase,
  openTransaction: () => Promise<SQLiteDatabase>
) {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const run = database.runAsync.bind(database);
  const exec = database.execAsync.bind(database);
  const runAsync = ((...args: Parameters<typeof run>) => enqueue(() => run(...args))) as typeof database.runAsync;
  const execAsync = (source: string) => enqueue(() => exec(source));
  const withExclusiveTransactionAsync: SQLiteDatabase["withExclusiveTransactionAsync"] = (task) => enqueue(async () => {
    const transaction = await openTransaction();
    let began = false;
    try {
      // Configure each new connection, before acquiring the write reservation.
      await transaction.execAsync("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
      await transaction.execAsync("BEGIN IMMEDIATE;");
      began = true;
      await task(transaction);
      await transaction.execAsync("COMMIT;");
      began = false;
    } catch (error) {
      if (began) await transaction.execAsync("ROLLBACK;").catch(() => undefined);
      throw error;
    } finally {
      await transaction.closeAsync();
    }
  });
  const overrides = { runAsync, execAsync, withExclusiveTransactionAsync };
  return new Proxy(database, {
    get(target, property) {
      if (property in overrides) return overrides[property as keyof typeof overrides];
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
