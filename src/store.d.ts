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
    // The name of the migration step
    name: string;
    // The function to apply the migration step
    apply: (data: Argument) => ReturnValue;
}

/**
	Configuration for creating a new Store.

	@interface StoreConfig
	.name string -- Name of the store
	.template T -- Template/default value for new data
	.schema (value: any) -> (boolean, string?) -- Validates data format
	.migrationSteps? { MigrationStep } -- Steps to migrate old data formats
	.importLegacyData? (key: string) -> any? -- Function to import legacy data
	.dataStoreService? DataStoreService -- Custom DataStore implementation
	.useMock? boolean -- Use mock DataStore (Studio only)
	.changedCallbacks? { (key: string, newData: T, oldData: T?) -> () } -- Run when data changes
	.logCallback? (logMessage: LogMessage) -> () -- Custom logging function
	.onLockLost? (key: string) -> () -- Called if DataStore lock is lost

	Example usage:
	```lua
	local config: StoreConfig<PlayerData> = {
		name = "PlayerData",
		template = {
			coins = 0,
			items = {},
		},
		schema = function(value)
			return typeof(value.coins) == "number", "coins must be a number"
		end,
	}
	```
 */
export interface StoreConfig<Schema> extends BaseStoreConfig<Schema> {
    // Optional function to call if the DataStore lock is lost
    onLockLost?: (key: string) => void;
    // Use a mock DataStore (Studio only)
    useMock?: boolean;
}

export namespace Store {
    /**
    Creates a new Store with the given configuration.

	```lua
	local store = Store.createStore({
		name = "PlayerData",
		template = { coins = 0 },
		schema = function(data)
			return typeof(data.coins) == "number", "coins must be a number"
		end,
		
		-- Optional: Runs whenever data changes
		changedCallbacks = {
			function(key, newData, oldData)
				print(key, "changed from", oldData.coins, "to", newData.coins)
			end,
		},

		-- Optional: Called if lock is lost during session
		onLockLost = function(key)
			warn("Lost lock for", key)
		end,
	})
	```

	!If schema validation fails at any point, operations will be rejected with the error message.

	@param config - Configuration for the store
	@returns {Store<Schema>}
     */
    export function createStore<Schema extends object>(
        config: StoreConfig<Schema>
    ): Store<Schema>;
}

export interface Store<Schema extends object> {
    /**
        Gets the current data for the given key.

        ```lua
        store:get("player_1"):andThen(function(data)
            print("Current coins:", data.coins)
        end):catch(function(err)
            warn("Failed to get data:", err)
        end)
        ```

        @error "Key not loaded" -- The key hasn't been loaded with store:load()
        @error "Store is closed" -- The store has been closed
        @return Promise<T> -- Resolves with the current data
    */
    get(key: string): Promise<Schema>;
    /**
     * Syntatic sugar for `get(key):expect().`
     * @returns {Schema} -- The player's data
     */
    getAsync(key: string): Schema;
    /**
        Loads data for the given key into memory and establishes a session.
        Must be called before using any other methods with this key.

        ```lua
        store:load("player_1"):andThen(function()
            print("Data loaded!")
        end):catch(function(err)
            warn("Failed to load:", err)
        end)
        ```

        @error "Load already in progress" -- Another load is already in progress for this key
        @error "Store is closed" -- The store has been closed
        @return Promise -- Resolves when data is loaded
    */
    load(key: string, userIds?: number[]): Promise<void>;
    /**
     * Syntatic sugar for `load(key):expect().`
     */
    loadAsync(key: string, userIds?: number[]): void;
    /**
        Unloads data for the given key from memory and ends the session.

        ```lua
        store:unload("player_1"):andThen(function()
            print("Data unloaded!")
        end)
        ```

        @error "Store is closed" -- The store has been closed
        @return Promise -- Resolves when data is unloaded
    */
    unload(key: string): Promise<boolean>;
    /**
     * Syntatic sugar for `unload(key):expect().`
     */
    unloadAsync(key: string): boolean;
    /**
        Updates data for the given key using a transform function.
        The transform function receives the current data and can modify it.
        Must return true to commit changes, or false to abort.

        ```lua
        store:update("player_1", function(data)
            if data.coins < 100 then
                data.coins += 50
                return true -- Commit changes
            end
            return false -- Don't commit changes
        end):andThen(function()
            print("Update successful!")
        end):catch(function(err)
            warn("Update failed:", err)
        end)
        ```

        @error "Key not loaded" -- The key hasn't been loaded with store:load()
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @return Promise<boolean> -- Resolves when the update is complete, with a boolean indicating success
    */
    update(
        key: string,
        transformFunction: (data: Schema) => boolean
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `update(key, transformFunction):expect().`
     */
    updateAsync(
        key: string,
        transformFunction: (data: Schema) => boolean
    ): boolean;
    /**
     *  Applies changes to the data for a given key using a transform function,
        with immutable copy-on-write semantics.

        The `transformFunction` receives the current data but frozen (immutable),
        and cannot modify it directly. Instead, it should return new data that
        reflects the desired changes. Otherwise it should return `false` to abort
        the update without saving.

        Changes are applied optimistically to the in-memory state first and then queued
        for saving to the DataStore.

        @param key string -- The key whose data to update.
        @param transformFunction (data: T) -> T | false -- A function that receives the current data and returns a new copy of the data with changes to commit changes, or `false` to abort.
        @return Promise<boolean> -- Resolves with `true` if the transform function committed and the update was successfully queued, or `false` if the transform function returned `false`. Rejects on errors like key not loaded, store closed, or schema validation failure after transformation.
        @error "Key not loaded" -- If `load()` has not been successfully called for this key.
        @error "Store is closed" -- If the store instance has been closed.
        @error "Schema validation failed" -- If the data returned by `transformFunction` does not pass the store's schema check.
     */
    updateImmutable(
        key: string,
        transformFunction: (data: Schema) => Schema | false
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `updateImmutable(key, transformFunction):expect().`
     */
    updateImmutableAsync(
        key: string,
        transformFunction: (data: Schema) => Schema | false
    ): boolean;
    /**
        Performs a transaction across multiple keys atomically.
        All keys must be loaded first. Either all changes are applied, or none are.

        ```lua
        store:tx({"player_1", "player_2"}, function(state)
            -- Transfer coins between players
            if state.player_1.coins >= 100 then
                state.player_1.coins -= 100
                state.player_2.coins += 100
                return true -- Commit transaction
            end
            return false -- Abort transaction
        end):andThen(function()
            print("Transaction successful!")
        end):catch(function(err)
            warn("Transaction failed:", err)
        end)
        ```

        @error "Key not loaded" -- One or more keys haven't been loaded
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @error "Keys changed in transaction" -- The transform function modified the keys table
        @return Promise -- Resolves when the transaction is complete
    */
    tx(
        keys: string[],
        transformFunction: (state: Map<string, Schema>) => boolean
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `tx(keys, transformFunction):expect().`
     */
    txAsync(
        keys: string[],
        transformFunction: (state: Map<string, Schema>) => boolean
    ): boolean;
    /**
     *  Performs an atomic transaction across multiple keys with immutable, copy-on-write semantics.

        The data passed to the function is frozen and cannot be modified directly.
        Instead, the function should return a new table with the desired changes.

        Requires the keys to be loaded first via `load()`. The `transformFunction`
        is called with the current state of all involved keys and must return the
        new state to commit or `false` to abort.

        Propagates errors from the transaction process, including DataStore errors,
        schema validation failures, and key loading issues.

        @param keys {string} -- An array of keys involved in the transaction.
        @param transformFunction (state: { [string]: T }) -> { [string]: T } | false -- The transformation function.
        @return Promise<boolean> -- Resolves with `true` if the transaction was successful, or `false` if it was aborted. Rejects on error.
        @error "Key not loaded" -- If any key in the `keys` array has not been loaded.
        @error "Key is already locked by another transaction" -- If any key is already involved in an ongoing `tx`.
        @error "Key is closed" -- If any involved session has been closed (e.g., due to lock loss).
        @error "Store is closed" -- If the store instance has been closed.
        @error "Schema validation failed" -- If the data for any key after transformation fails the schema check.
        @error "Keys changed in transaction" -- If the `transformFunction` attempts to add or remove keys from the state table it receives.
     */
    txImmutable(
        keys: string[],
        transformFunction: (
            state: Map<string, Schema>
        ) => Map<string, Schema> | false
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `txImmutable(keys, transformFunction):expect().`
     */
    txImmutableAsync(
        keys: string[],
        transformFunction: (
            state: Map<string, Schema>
        ) => Map<string, Schema> | false
    ): boolean;
    /**
        Forces an immediate save of the given key's data.
        
        !Data is automatically saved periodically, so manual saves are usually only useful in scenarios where you need to guarantee data has saved, such as ProcessReceipt.

        @error "Key not loaded" -- The key hasn't been loaded with store:load()
        @error "Store is closed" -- The store has been closed
        @return Promise -- Resolves when the save is complete
    */
    save(key: string): Promise<void>;
    /**
     * Syntatic sugar for `save(key):expect().`
     */
    saveAsync(key: string): void;
    /**
        Closes the store and unloads all active sessions.
        The store cannot be used after closing.
    
        @returns {Promise<void>} -- Resolves when the store is closed
    */
    close(): Promise<void>;
    /**
     * Syntatic sugar for `close():expect().`
     */
    closeAsync(): void;
    /**
        Returns the current data for the given key without loading it into the store.

        ```lua
        store:peek("456123"):andThen(function(data)
            print("Current coins:", data.coins)
        end):catch(function(err)
            warn("Failed to peek data:", err)
        end)
        ```

        @return Promise<T> -- Resolves with the data object, or `nil` if the key doesn't exist. Rejects on DataStore errors.
    */
    peek(key: string): Promise<Schema | undefined>;
    /**
     * Syntatic sugar for `peek(key):expect().`
     */
    peekAsync(key: string): Schema | undefined;
    /**
        Checks if a lock is currently active for the given key.

	    @return Promise<boolean>
     */
    probeLockActive(key: string): Promise<boolean>;
    /**
     * Syntatic sugar for `probeLockActive(key):expect().`
     */
    probeLockActiveAsync(key: string): boolean;
    /**
    Returns DataStoreVersionPages for the given key.

	@return Promise<DataStoreVersionPages>
     */
    listVersions(params: ListVersionParams): Promise<DataStoreVersionPages>;
    /**
     * Syntatic sugar for `listVersions(params):expect().`
     */
    listVersionsAsync(params: ListVersionParams): DataStoreVersionPages;
    /**
    Reads a specific version of data for the given key.

	@return Promise<T, DataStoreKeyInfo>
     */
    readVersion(
        key: string,
        version: string
    ): Promise<LuaTuple<[Schema, DataStoreKeyInfo]>>;
    /**
     * Syntatic sugar for `readVersion(key, version):expect().`
     */
    readVersionAsync(
        key: string,
        version: string
    ): LuaTuple<[Schema, DataStoreKeyInfo]>;
}
