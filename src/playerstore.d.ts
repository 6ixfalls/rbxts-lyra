import { BaseStoreConfig } from "./sharedstore";

/**
 * Configuration for creating a new Store.

	@interface PlayerStoreConfig
	.name string -- The name of the store
	.template T -- The template data for new keys
	.schema (value: any) -> (boolean, string?) -- A function to validate data
	.migrationSteps { MigrationStep }? -- Optional migration steps
	.importLegacyData ((key: string) -> any?)? -- Optional function to import legacy data
	.changedCallbacks { (key: string, newData: T, oldData: T?) -> () }? -- Optional callbacks for data changes
	.logCallback ((logMessage: LogMessage) -> ())? -- Optional callback for log messages
	.memoryStoreService MemoryStoreService? -- Optional MemoryStoreService instance for mocking
	.dataStoreService DataStoreService? -- Optional DataStoreService instance for mocking
 */
export type PlayerStoreConfig<Schema> = BaseStoreConfig<Schema>;

export namespace PlayerStore {
    /**
     * Creates a player store.
     *
     * @param config The configuration for the player store.
     */
    export function create<Schema extends object>(
        config: PlayerStoreConfig<Schema>
    ): PlayerStore<Schema>;
}

export interface PlayerStore<Schema extends object> {
    /**
        Gets the current data for the given player.
    
        ```lua
        playerStore:get(player):andThen(function(data)
            print(player.Name, "has", data.coins, "coins")
        end)
        ```
    
        @error "Key not loaded" -- The player's data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @returns {Promise<Schema>} -- Resolves with the player's data
    */
    get(player: Player): Promise<Schema>;
    /**
     * Syntatic sugar for `get(player):expect().`
     * @returns {Schema} -- The player's data
     */
    getAsync(player: Player): Schema;
    /**
        Loads data for the given player. Must be called before using other methods.

        ```lua
        playerStore:load(player):andThen(function()
            print("Data loaded for", player.Name)
        end)
        ```

        ! If loading fails, the player will be kicked from the game.

        @error "Load already in progress" -- Another load is in progress for this player
        @error "Store is closed" -- The store has been closed
        @returns {Promise<void>} -- Resolves when data is loaded
    */
    load(player: Player): Promise<void>;
    /**
     * Syntatic sugar for `load(player):expect().`
     */
    loadAsync(player: Player): void;
    /**
     * 	Unloads data for the given player.

        ```lua
        playerStore:unload(player):andThen(function()
            print("Data unloaded for", player.Name)
        end)
        ```

        @error "Store is closed" -- The store has been closed
        @returns {Promise<boolean>} -- Resolves when the update is complete, with a boolean indicating success
     */
    unload(player: Player): Promise<boolean>;
    /**
     * Syntatic sugar for `unload(player):expect().`
     */
    unloadAsync(player: Player): boolean;
    /**
     * 	Updates data for the given player using a transform function.
        The transform function must return true to commit changes, or false to abort.

        ```lua
        playerStore:update(player, function(data)
            if data.coins < 100 then
                data.coins += 50
                return true -- Commit changes
            end
            return false -- Don't commit changes
        end)
        ```

        @error "Key not loaded" -- The player's data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @returns {Promise<boolean>} -- Resolves when the update is complete
     */
    update(
        player: Player,
        transformFunction: (data: Schema) => boolean
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `update(player, transformFunction):expect().`
     */
    updateAsync(
        player: Player,
        transformFunction: (data: Schema) => boolean
    ): boolean;
    /**
     *  Updates data for the given player using a transform function that does not mutate the original data.
        The transform function must return the new data or false to abort.

        ```lua
        playerStore:updateImmutable(player, function(data)
            if data.coins < 100 then
                return { coins = data.coins + 50 } -- Return new data to commit changes
            end
            return false -- Don't commit changes
        end)
        ```

        @error "Key not loaded" -- The player's data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @returns {Promise<boolean>} -- Resolves when the update is complete
     */
    updateImmutable(
        player: Player,
        transformFunction: (data: Schema) => Schema | false
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `updateImmutable(player, transformFunction):expect().`
     */
    updateImmutableAsync(
        player: Player,
        transformFunction: (data: Schema) => Schema | false
    ): boolean;
    /**
     * 	Performs a transaction across multiple players' data atomically.
        All players' data must be loaded first. Either all changes apply or none do.

        ```lua
        playerStore:tx({player1, player2}, function(state)
            -- Transfer coins between players
            if state[player1].coins >= 100 then
                state[player1].coins -= 100
                state[player2].coins += 100
                return true -- Commit transaction
            end
            return false -- Abort transaction
        end)
        ```

        @error "Key not loaded" -- One or more players' data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @returns {Promise<boolean>} -- Resolves when the transaction is complete
     */
    tx(
        players: Player[],
        transformFunction: (state: Map<Player, Schema>) => boolean
    ): Promise<boolean>;
    /**
     * Syntatic sugar for `tx(players, transformFunction):expect().`
     */
    txAsync(
        players: Player[],
        transformFunction: (state: Map<Player, Schema>) => boolean
    ): boolean;
    /**
     *  Performs a transaction across multiple players' data atomically using immutable updates.
        All players' data must be loaded first. Either all changes apply or none do.

        ```lua
        playerStore:txImmutable({player1, player2}, function(state)
            -- Transfer coins between players
            if state[player1].coins >= 100 then
                return {
                    [player1] = { coins = state[player1].coins - 100 },
                    [player2] = { coins = state[player2].coins + 100 },
                } -- Commit transaction with new data
            end
            return false -- Abort transaction
        end)
        ```

        @error "Key not loaded" -- One or more players' data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @error "Schema validation failed" -- The transformed data failed schema validation
        @returns {Promise<boolean>} -- Resolves with `true` if the transaction was successful, or `false` if it was aborted. Rejects on error.
     */
    txImmutable(
        players: Player[],
        transformFunction: (
            state: Map<Player, Schema>
        ) => Map<Player, Schema> | false
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `txImmutable(players, transformFunction):expect().`
     */
    txImmutableAsync(
        players: Player[],
        transformFunction: (
            state: Map<Player, Schema>
        ) => Map<Player, Schema> | false
    ): boolean;
    /**
     * 	Forces an immediate save of the given player's data.

        ! Data is automatically saved periodically, so manual saves are usually unnecessary.

        @error "Key not loaded" -- The player's data hasn't been loaded
        @error "Store is closed" -- The store has been closed
        @returns {Promise<void>} -- Resolves when the save is complete
     */
    save(player: Player): Promise<void>;
    /**
     * Syntatic sugar for `save(player):expect().`
     */
    saveAsync(player: Player): void;
    /**
     * 	Closes the store and unloads all active sessions.
        The store cannot be used after closing.

        @returns {Promise<void>} -- Resolves when the store is closed
     */
    close(): Promise<void>;
    /**
     * Syntatic sugar for `close():expect().`
     */
    closeAsync(): void;
    /**
     * Returns the current data for the given key without loading it into the store.

        ```lua
        playerStore:peek(userId):andThen(function(data)
            print("Current coins:", data.coins)
        end)
        ```

        @returns {Promise<Schema>} -- Resolves with the data object, or `nil` if the key doesn't exist. Rejects on DataStore errors.
     */
    peek(userId: number): Promise<Schema | undefined>;
    /**
     * Syntatic sugar for `peek(userId):expect().`
     */
    peekAsync(userId: number): Schema | undefined;
}
