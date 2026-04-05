/**
 * Database Manager
 * 
 * Manages the SQLite connection lifecycle, schema initialization,
 * and provides a unified query interface.
 * 
 * In production (React Native), this uses react-native-sqlite-storage.
 * For testing, it can be replaced with a mock or in-memory SQLite.
 */

import { CREATE_TABLES_SQL, CREATE_INDICES_SQL, PRAGMA_SQL, DROP_ALL_TABLES_SQL } from './schema';
import { Logger } from '../../utils/logger';
import { DB_NAME } from '../../utils/constants';

const log = Logger.create('DBManager');

/**
 * Database interface abstraction.
 * This allows us to swap implementations for testing vs production.
 */
export interface DatabaseConnection {
  executeSql(sql: string, params?: any[]): Promise<DatabaseResult>;
  transaction(fn: (tx: TransactionContext) => void): Promise<void>;
  close(): Promise<void>;
}

export interface TransactionContext {
  executeSql(sql: string, params?: any[]): void;
}

export interface DatabaseResult {
  rows: {
    length: number;
    item(index: number): any;
    raw(): any[];
  };
  insertId?: number;
  rowsAffected: number;
}

/**
 * Database Manager singleton.
 * Handles connection lifecycle, schema initialization, and query execution.
 */
class DatabaseManager {
  private db: DatabaseConnection | null = null;
  private initialized = false;

  /**
   * Initialize the database.
   * Creates tables, indices, and sets performance pragmas.
   * 
   * @param connection - The database connection to use
   */
  async initialize(connection: DatabaseConnection): Promise<void> {
    if (this.initialized) {
      log.debug('Database already initialized');
      return;
    }

    this.db = connection;

    try {
      // Set performance pragmas
      for (const pragma of PRAGMA_SQL) {
        await this.db.executeSql(pragma);
      }
      log.debug('Pragmas set successfully');

      // Create tables
      for (const createSql of CREATE_TABLES_SQL) {
        await this.db.executeSql(createSql);
      }
      log.debug('Tables created successfully');

      // Create indices
      for (const indexSql of CREATE_INDICES_SQL) {
        await this.db.executeSql(indexSql);
      }
      log.debug('Indices created successfully');

      this.initialized = true;
      log.info('Database initialized successfully');
    } catch (error) {
      log.error(`Database initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get the database connection.
   * Throws if not initialized.
   */
  getConnection(): DatabaseConnection {
    if (!this.db || !this.initialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a SQL query and return results.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const conn = this.getConnection();
    const result = await conn.executeSql(sql, params);
    const rows: T[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
    return rows;
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE).
   */
  async execute(sql: string, params: any[] = []): Promise<{ rowsAffected: number }> {
    const conn = this.getConnection();
    const result = await conn.executeSql(sql, params);
    return { rowsAffected: result.rowsAffected };
  }

  /**
   * Execute multiple SQL statements in a transaction.
   */
  async executeTransaction(
    statements: Array<{ sql: string; params?: any[] }>,
  ): Promise<void> {
    const conn = this.getConnection();
    await conn.transaction((tx) => {
      for (const stmt of statements) {
        tx.executeSql(stmt.sql, stmt.params || []);
      }
    });
  }

  /**
   * Reset the database (drop all tables and re-create).
   * USE ONLY FOR TESTING.
   */
  async reset(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    log.warn('Resetting database — all data will be lost!');

    for (const dropSql of DROP_ALL_TABLES_SQL) {
      await this.db.executeSql(dropSql);
    }

    for (const createSql of CREATE_TABLES_SQL) {
      await this.db.executeSql(createSql);
    }

    for (const indexSql of CREATE_INDICES_SQL) {
      await this.db.executeSql(indexSql);
    }

    log.info('Database reset complete');
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
      log.info('Database connection closed');
    }
  }

  /**
   * Check if the database is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export a singleton instance
export const dbManager = new DatabaseManager();
