import { BaseStoreConfig } from "./sharedstore";

type MigrationChain<ValidatedData> = MigrationStep<any, any>[];

type ListVersionParams = {
    key: string;
    sortDirection?: Enum.SortDirection;
    minDate?: number;
    maxDate?: number;
    pageSize?: number;
};

export interface MigrationStep<Argument, ReturnValue> {
    /**
     * The name of the migration step
     */
    name: string;
    /**
     * The function to apply the migration step
     */
    apply: (data: Argument) => ReturnValue;
}

/**
 * Configuration for creating a new Store.
 *
 * @interface StoreConfig
 *
 * @example
 * ```ts
 * const config: StoreConfig<PlayerData> = {
 *     name: "PlayerData",
 *     template: {
 *         coins: 0,
 *         items: {},
 *     },
 *     schema: (data: any): data is { coins: number; items: Record<string, number> } =>
 *         typeof data.coins === "number" && typeof data.items === "object",
 * };
 * ```
 */
export interface StoreConfig<Schema> extends BaseStoreConfig<Schema> {
    /**
     * Optional function to call if the DataStore lock is lost
     */
    onLockLost?: (key: string) => void;
}

export namespace Store {
    /**
     * Creates a new Store with the given configuration.
     *
     * @remarks If schema validation fails at any point, operations will be rejected with the error message.
     *
     * @example
     * ```ts
     * const store = Store.createStore({
     *     name: "PlayerData",
     *     template: { coins: 0 },
     *     schema: (data: any): data is { coins: number } => typeof data.coins === "number",
     *
     *     // Optional: Runs whenever data changes
     *     changedCallbacks: [
     *         (key, newData, oldData) => {
     *             print(key, "changed from", oldData?.coins, "to", newData.coins);
     *         },
     *     ],
     *
     *     // Optional: Called if lock is lost during session
     *     onLockLost: (key) => {
     *         warn("Lost lock for", key);
     *     },
     * });
     * ```
     *
     * @param config Configuration for the store
     * @returns A new Store instance
     */
    export function createStore<Schema extends object>(
        config: StoreConfig<Schema>,
    ): Store<Schema>;
}

export interface Store<Schema extends object> {
    /**
     * Gets the current data for the given key.
     *
     * @example
     * ```ts
     * store.get("player_1").then((data) => {
     *     print("Current coins:", data.coins);
     * }).catch((err) => {
     *     warn("Failed to get data:", err);
     * });
     * ```
     *
     * @error "Key not loaded" The key hasn't been loaded with store.load()
     * @error "Store is closed" The store has been closed
     * @returns Resolves with the current data
     */
    get(key: string): Promise<Schema>;
    /**
     * Syntactic sugar for `get(key):expect()`.
     * @returns The current data
     */
    getAsync(key: string): Schema;
    /**
     * Loads data for the given key into memory and establishes a session.
     * Must be called before using any other methods with this key.
     *
     * @example
     * ```ts
     * store.load("player_1").then(() => {
     *     print("Data loaded!");
     * }).catch((err) => {
     *     warn("Failed to load:", err);
     * });
     * ```
     *
     * @error "Load already in progress" Another load is already in progress for this key
     * @error "Store is closed" The store has been closed
     * @returns Resolves when data is loaded
     */
    load(key: string, userIds?: number[]): Promise<void>;
    /**
     * Syntactic sugar for `load(key):expect()`.
     */
    loadAsync(key: string, userIds?: number[]): void;
    /**
     * Unloads data for the given key from memory and ends the session.
     *
     * @example
     * ```ts
     * store.unload("player_1").then(() => {
     *     print("Data unloaded!");
     * });
     * ```
     *
     * @error "Store is closed" The store has been closed
     * @returns Resolves when data is unloaded
     */
    unload(key: string): Promise<boolean>;
    /**
     * Syntactic sugar for `unload(key):expect()`.
     */
    unloadAsync(key: string): boolean;
    /**
     * Updates data for the given key using a transform function.
     * The transform function receives the current data and can modify it.
     * Must return true to commit changes, or false to abort.
     *
     * @example
     * ```ts
     * store.update("player_1", (data) => {
     *     if (data.coins < 100) {
     *         data.coins += 50;
     *         return true; // Commit changes
     *     }
     *     return false; // Don't commit changes
     * }).then(() => {
     *     print("Update successful!");
     * }).catch((err) => {
     *     warn("Update failed:", err);
     * });
     * ```
     *
     * @error "Key not loaded" The key hasn't been loaded with store.load()
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @returns Resolves when the update is complete, with a boolean indicating success
     */
    update(
        key: string,
        transformFunction: (data: Schema) => boolean,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `update(key, transformFunction):expect()`.
     */
    updateAsync(
        key: string,
        transformFunction: (data: Schema) => boolean,
    ): boolean;
    /**
     * Applies changes to the data for a given key using a transform function,
     * with immutable copy-on-write semantics.
     *
     * The `transformFunction` receives the current data but frozen (immutable),
     * and cannot modify it directly. Instead, it should return new data that
     * reflects the desired changes. Otherwise it should return `false` to abort
     * the update without saving.
     *
     * Changes are applied optimistically to the in-memory state first and then queued
     * for saving to the DataStore.
     *
     * @param key The key whose data to update.
     * @param transformFunction A function that receives the current data and returns a new copy of the data with changes to commit changes, or `false` to abort.
     * @returns Resolves with `true` if the transform function committed and the update was successfully queued, or `false` if the transform function returned `false`. Rejects on errors like key not loaded, store closed, or schema validation failure after transformation.
     * @error "Key not loaded" If `load()` has not been successfully called for this key.
     * @error "Store is closed" If the store instance has been closed.
     * @error "Schema validation failed" If the data returned by `transformFunction` does not pass the store's schema check.
     */
    updateImmutable(
        key: string,
        transformFunction: (data: Schema) => Schema | false,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `updateImmutable(key, transformFunction):expect()`.
     */
    updateImmutableAsync(
        key: string,
        transformFunction: (data: Schema) => Schema | false,
    ): boolean;
    /**
     * Performs a transaction across multiple keys atomically.
     * All keys must be loaded first. Either all changes are applied, or none are.
     *
     * @example
     * ```ts
     * store.tx(["player_1", "player_2"], (state) => {
     *     // Transfer coins between players
     *     if (state.get("player_1")!.coins >= 100) {
     *         state.get("player_1")!.coins -= 100;
     *         state.get("player_2")!.coins += 100;
     *         return true; // Commit transaction
     *     }
     *     return false; // Abort transaction
     * }).then(() => {
     *     print("Transaction successful!");
     * }).catch((err) => {
     *     warn("Transaction failed:", err);
     * });
     * ```
     *
     * @error "Key not loaded" One or more keys haven't been loaded
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @error "Keys changed in transaction" The transform function modified the keys array
     * @returns Resolves when the transaction is complete
     */
    tx(
        keys: string[],
        transformFunction: (state: Map<string, Schema>) => boolean,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `tx(keys, transformFunction):expect()`.
     */
    txAsync(
        keys: string[],
        transformFunction: (state: Map<string, Schema>) => boolean,
    ): boolean;
    /**
     * Performs an atomic transaction across multiple keys with immutable, copy-on-write semantics.
     *
     * The data passed to the function is frozen and cannot be modified directly.
     * Instead, the function should return a new state Map with the desired changes.
     *
     * Requires the keys to be loaded first via `load()`. The `transformFunction`
     * is called with the current state of all involved keys and must return the
     * new state to commit or `false` to abort.
     *
     * Propagates errors from the transaction process, including DataStore errors,
     * schema validation failures, and key loading issues.
     *
     * @param keys An array of keys involved in the transaction.
     * @param transformFunction A function that receives the current state Map and returns a new state Map with changes, or `false` to abort.
     * @returns Resolves with `true` if the transaction was successful, or `false` if it was aborted. Rejects on error.
     * @error "Key not loaded" If any key in the `keys` array has not been loaded.
     * @error "Key is already locked by another transaction" If any key is already involved in an ongoing `tx`.
     * @error "Key is closed" If any involved session has been closed (e.g., due to lock loss).
     * @error "Store is closed" If the store instance has been closed.
     * @error "Schema validation failed" If the data for any key after transformation fails the schema check.
     * @error "Keys changed in transaction" If the `transformFunction` attempts to add or remove keys from the state Map it receives.
     */
    txImmutable(
        keys: string[],
        transformFunction: (
            state: Map<string, Schema>,
        ) => Map<string, Schema> | false,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `txImmutable(keys, transformFunction):expect().`
     */
    txImmutableAsync(
        keys: string[],
        transformFunction: (
            state: Map<string, Schema>,
        ) => Map<string, Schema> | false,
    ): boolean;
    /**
     * Forces an immediate save of the given key's data.
     *
     * @remarks Data is automatically saved periodically, so manual saves are usually only useful in scenarios where you need to guarantee data has saved, such as ProcessReceipt.
     *
     * @error "Key not loaded" The key hasn't been loaded with store.load()
     * @error "Store is closed" The store has been closed
     * @returns Resolves when the save is complete
     */
    save(key: string): Promise<void>;
    /**
     * Syntactic sugar for `save(key):expect()`.
     */
    saveAsync(key: string): void;
    /**
     * Closes the store and unloads all active sessions.
     * The store cannot be used after closing.
     *
     * @returns Resolves when the store is closed
     */
    close(): Promise<void>;
    /**
     * Syntactic sugar for `close():expect()`.
     */
    closeAsync(): void;
    /**
     * Returns the current data for the given key without loading it into the store.
     *
     * @example
     * ```ts
     * store.peek("456123").then((data) => {
     *     if (data) {
     *         print("Current coins:", data.coins);
     *     }
     * }).catch((err) => {
     *     warn("Failed to peek data:", err);
     * });
     * ```
     *
     * @returns Resolves with the data object, or `undefined` if the key doesn't exist. Rejects on DataStore errors.
     */
    peek(key: string): Promise<Schema | undefined>;
    /**
     * Syntactic sugar for `peek(key):expect()`.
     */
    peekAsync(key: string): Schema | undefined;
    /**
     * Checks if a lock is currently active for the given key.
     *
     * @returns Resolves with a boolean indicating if the lock is active
     */
    probeLockActive(key: string): Promise<boolean>;
    /**
     * Syntactic sugar for `probeLockActive(key):expect()`.
     */
    probeLockActiveAsync(key: string): boolean;
    /**
     * Returns DataStoreVersionPages for the given key.
     *
     * @returns Resolves with the DataStoreVersionPages for the key
     */
    listVersions(params: ListVersionParams): Promise<DataStoreVersionPages>;
    /**
     * Syntactic sugar for `listVersions(params):expect()`.
     */
    listVersionsAsync(params: ListVersionParams): DataStoreVersionPages;
    /**
     * Reads a specific version of data for the given key.
     *
     * @returns Resolves with a tuple containing the data and key info
     */
    readVersion(
        key: string,
        version: string,
    ): Promise<LuaTuple<[Schema, DataStoreKeyInfo]>>;
    /**
     * Syntactic sugar for `readVersion(key, version):expect()`.
     */
    readVersionAsync(
        key: string,
        version: string,
    ): LuaTuple<[Schema, DataStoreKeyInfo]>;
}
