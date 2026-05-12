import { BaseStoreConfig } from "./sharedstore";

/**
 * Configuration for creating a new Store.
 *
 * @interface PlayerStoreConfig
 */
export type PlayerStoreConfig<Schema> = BaseStoreConfig<Schema>;

export namespace PlayerStore {
    /**
     * Creates a player store.
     *
     * @param config The configuration for the player store.
     */
    export function create<Schema extends object>(
        config: PlayerStoreConfig<Schema>,
    ): PlayerStore<Schema>;
}

export interface PlayerStore<Schema extends object> {
    /**
     * Gets the current data for the given player.
     *
     * @example
     * ```ts
     * playerStore.get(player).then((data) => {
     *     print(player.Name, "has", data.coins, "coins");
     * });
     * ```
     *
     * @error "Key not loaded" The player's data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @returns Resolves with the player's data
     */
    get(player: Player): Promise<Schema>;
    /**
     * Syntactic sugar for `get(player):expect()`.
     * @returns The player's data
     */
    getAsync(player: Player): Schema;
    /**
     * Loads data for the given player. Must be called before using other methods.
     *
     * @remarks If loading fails, the player will be kicked from the game.
     *
     * @example
     * ```ts
     * playerStore.load(player).then(() => {
     *     print("Data loaded for", player.Name);
     * });
     * ```
     *
     * @error "Load already in progress" Another load is in progress for this player
     * @error "Store is closed" The store has been closed
     * @returns Resolves when data is loaded
     */
    load(player: Player): Promise<void>;
    /**
     * Syntactic sugar for `load(player):expect()`.
     */
    loadAsync(player: Player): void;
    /**
     * Unloads data for the given player.
     *
     * @example
     * ```ts
     * playerStore.unload(player).then(() => {
     *     print("Data unloaded for", player.Name);
     * });
     * ```
     *
     * @error "Store is closed" The store has been closed
     * @returns Resolves when the update is complete, with a boolean indicating success
     */
    unload(player: Player): Promise<boolean>;
    /**
     * Syntactic sugar for `unload(player):expect()`.
     */
    unloadAsync(player: Player): boolean;
    /**
     * Updates data for the given player using a transform function.
     * The transform function must return true to commit changes, or false to abort.
     *
     * @example
     * ```ts
     * playerStore.update(player, (data) => {
     *     if (data.coins < 100) {
     *         data.coins += 50;
     *         return true; // Commit changes
     *     }
     *     return false; // Don't commit changes
     * });
     * ```
     *
     * @error "Key not loaded" The player's data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @returns Resolves when the update is complete, with the boolean returned by the transformFunction
     */
    update(
        player: Player,
        transformFunction: (data: Schema) => boolean,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `update(player, transformFunction):expect()`.
     */
    updateAsync(
        player: Player,
        transformFunction: (data: Schema) => boolean,
    ): boolean;
    /**
     * Updates data for the given player using a transform function that does not mutate the original data.
     * The transform function must return the new data or false to abort.
     *
     * @example
     * ```ts
     * playerStore.updateImmutable(player, (data) => {
     *     if (data.coins < 100) {
     *         return { coins: data.coins + 50 }; // Return new data to commit changes
     *     }
     *     return false; // Don't commit changes
     * });
     * ```
     *
     * @error "Key not loaded" The player's data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @returns Resolves when the update is complete
     */
    updateImmutable(
        player: Player,
        transformFunction: (data: Schema) => Schema | false,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `updateImmutable(player, transformFunction):expect()`.
     */
    updateImmutableAsync(
        player: Player,
        transformFunction: (data: Schema) => Schema | false,
    ): boolean;
    /**
     * Performs a transaction across multiple players' data atomically.
     * All players' data must be loaded first. Either all changes apply or none do.
     *
     * @example
     * ```ts
     * playerStore.tx([player1, player2], (state) => {
     *     // Transfer coins between players
     *     if (state.get(player1)!.coins >= 100) {
     *         state.get(player1)!.coins -= 100;
     *         state.get(player2)!.coins += 100;
     *         return true; // Commit transaction
     *     }
     *     return false; // Abort transaction
     * });
     * ```
     *
     * @error "Key not loaded" One or more players' data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @returns Resolves with `true` if the transaction was successful, or `false` if it was aborted. Rejects on error.
     */
    tx(
        players: Player[],
        transformFunction: (state: Map<Player, Schema>) => boolean,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `tx(players, transformFunction):expect()`.
     */
    txAsync(
        players: Player[],
        transformFunction: (state: Map<Player, Schema>) => boolean,
    ): boolean;
    /**
     * Performs a transaction across multiple players' data atomically using immutable updates.
     * All players' data must be loaded first. Either all changes apply or none do.
     *
     * @example
     * ```ts
     * playerStore.txImmutable([player1, player2], (state) => {
     *     // Transfer coins between players
     *     if (state.get(player1)!.coins >= 100) {
     *         return new Map([
     *             [player1, { coins: state.get(player1)!.coins - 100 }],
     *             [player2, { coins: state.get(player2)!.coins + 100 }],
     *         ]); // Commit transaction with new data
     *     }
     *     return false; // Abort transaction
     * });
     * ```
     *
     * @error "Key not loaded" One or more players' data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @error "Schema validation failed" The transformed data failed schema validation
     * @returns Resolves with `true` if the transaction was successful, or `false` if it was aborted. Rejects on error.
     */
    txImmutable(
        players: Player[],
        transformFunction: (
            state: Map<Player, Schema>,
        ) => Map<Player, Schema> | false,
    ): Promise<boolean>;
    /**
     * Syntactic sugar for `txImmutable(players, transformFunction):expect().`
     */
    txImmutableAsync(
        players: Player[],
        transformFunction: (
            state: Map<Player, Schema>,
        ) => Map<Player, Schema> | false,
    ): boolean;
    /**
     * Forces an immediate save of the given player's data.
     *
     * @remarks Data is automatically saved periodically, so manual saves are usually unnecessary.
     *
     * @error "Key not loaded" The player's data hasn't been loaded
     * @error "Store is closed" The store has been closed
     * @returns Resolves when the save is complete
     */
    save(player: Player): Promise<void>;
    /**
     * Syntactic sugar for `save(player):expect()`.
     */
    saveAsync(player: Player): void;
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
     * playerStore.peek(userId).then((data) => {
     *     if (data) {
     *         print("Current coins:", data.coins);
     *     }
     * });
     * ```
     *
     * @returns Resolves with the data object, or `undefined` if the key doesn't exist. Rejects on DataStore errors.
     */
    peek(userId: number): Promise<Schema | undefined>;
    /**
     * Syntactic sugar for `peek(userId):expect()`.
     */
    peekAsync(userId: number): Schema | undefined;
}
