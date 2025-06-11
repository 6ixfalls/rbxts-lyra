local ReplicatedStorage = game:GetService("ReplicatedStorage")

local JestGlobals = require(ReplicatedStorage.DevPackages.JestGlobals)
local MockDataStoreService = require(ReplicatedStorage.Packages.Lyra.MockDataStoreService)
local MockMemoryStoreService = require(ReplicatedStorage.Packages.Lyra.MockMemoryStoreService)
local Store = require(ReplicatedStorage.Packages.Lyra.Store)

local expect = JestGlobals.expect
local describe = JestGlobals.describe
local it = JestGlobals.it
local beforeEach = JestGlobals.beforeEach
local afterEach = JestGlobals.afterEach
local jest = JestGlobals.jest

describe("tx", function()
	local store
	local mockData
	local mockMemory

	local function resetStore()
		store = Store.createStore({
			name = "tx tests",
			template = { coins = 0 },
			dataStoreService = mockData,
			memoryStoreService = mockMemory,
			schema = function(data)
				return typeof(data.coins) == "number", "Invalid data format"
			end,
		})
	end

	local function crash()
		local snap = MockDataStoreService.snapshot(mockData)
		store:close()
		for _ = 1, 5 do
			jest.advanceTimersByTime(1000)
		end
		MockDataStoreService.restore(mockData, snap)
	end

	beforeEach(function()
		jest.useFakeTimers()

		mockData = MockDataStoreService.new()
		mockMemory = MockMemoryStoreService.new()
		resetStore()
	end)

	afterEach(function()
		jest.clearAllTimers()
		jest.useRealTimers()
	end)

	it("crash before commit should result in abort", function()
		store:load("key1")
		store:load("key2")

		jest.advanceTimersByTime(1000)

		local key2Set = false
		local setMock, realSet = MockDataStoreService.mockStoreMethod(mockData, "SetAsync", jest)
		setMock.mockImplementation(function(self, key, ...)
			if key == "key1" then
				local ret = table.pack(realSet(self, key, ...))
				key2Set = true
				return table.unpack(ret)
			end
			return realSet(self, key, ...)
		end)

		store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return true
		end)

		local i = 0
		while key2Set == false do
			i += 1
			if i > 1000 then
				break
			end
			jest.advanceTimersByTime(1)
		end

		crash()
		resetStore()

		store:load("key1")
		jest.advanceTimersByTime(1000)

		local key1Data = store:get("key1")
		jest.advanceTimersByTime(1000)

		expect(key2Set).toBe(true)
		return expect(key1Data).resolves.toEqual({ coins = 0 })
	end)

	it("crash after commit should save changed", function()
		store:load("key1")
		store:load("key2")

		jest.advanceTimersByTime(1000)

		local txCommitted = false
		local removeMock, realRemove = MockDataStoreService.mockStoreMethod(mockData, "RemoveAsync", jest)
		removeMock.mockImplementation(function(self, key, ...)
			local ret = table.pack(realRemove(self, key, ...))
			txCommitted = true
			return table.unpack(ret)
		end)

		store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return true
		end)

		local i = 0
		while txCommitted == false do
			i += 1
			if i > 1000 then
				break
			end
			jest.advanceTimersByTime(1)
		end

		crash()
		resetStore()

		local load1 = store:load("key1")
		local load2 = store:load("key2")
		jest.advanceTimersByTime(1000)

		load1:expect()
		load2:expect()

		local key1Data = store:get("key1")
		local key2Data = store:get("key2")
		jest.advanceTimersByTime(1000)

		return expect(key1Data).resolves.toEqual({ coins = 10 }):andThen(function()
			return expect(key2Data).resolves.toEqual({ coins = 10 })
		end)
	end)

	it("should reject if any key is not loaded", function()
		store:load("key1")
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return true
		end)

		return expect(txPromise).rejects.toEqual("Key not loaded: key2")
	end)

	it("should reject if store is closed", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		store:close()
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return true
		end)

		return expect(txPromise).rejects.toEqual("Store is closed")
	end)

	it("should reject if schema validation fails", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins = "invalid"
			state.key2.coins += 10
			return true
		end)
		jest.advanceTimersByTime(1000)

		return expect(txPromise).rejects.toMatch("schema validation failed")
	end)

	it("should reject if keys are modified in transform", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key3 = { coins = 10 }
			return true
		end)
		jest.advanceTimersByTime(1000)

		return expect(txPromise).rejects.toMatch("Keys changed in transaction")
	end)

	it("should handle single key changes as normal update", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local keySet = false
		local setMock, realSet = MockDataStoreService.mockStoreMethod(mockData, "SetAsync", jest)
		setMock.mockImplementation(function(self, key, ...)
			keySet = true
			return realSet(self, key, ...)
		end)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			return true
		end)

		jest.advanceTimersByTime(1000)

		return txPromise
			:andThen(function()
				expect(keySet).toBe(false)
				return store:get("key1")
			end)
			:andThen(function(key1Data)
				return expect(key1Data).toEqual({ coins = 10 })
			end)
	end)

	it("should early exit with no changes", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local keySet = false
		local setMock, realSet = MockDataStoreService.mockStoreMethod(mockData, "SetAsync", jest)
		setMock.mockImplementation(function(self, key, ...)
			keySet = true
			return realSet(self, key, ...)
		end)

		local txPromise = store:tx({ "key1", "key2" }, function()
			return true
		end)

		jest.advanceTimersByTime(1000)

		return expect(txPromise).resolves.toBe(true):andThen(function()
			expect(keySet).toBe(false)
		end)
	end)

	it("should prevent concurrent updates during transaction", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return true
		end)

		local updateStarted = false

		local txCommitted = false
		local removeMock, realRemove = MockDataStoreService.mockStoreMethod(mockData, "RemoveAsync", jest)
		removeMock.mockImplementation(function(self, key, ...)
			local ret = table.pack(realRemove(self, key, ...))
			expect(updateStarted).toBe(false)
			txCommitted = true
			return table.unpack(ret)
		end)

		store:update("key1", function(data)
			updateStarted = true
			data.coins += 5
			return true
		end)

		jest.advanceTimersByTime(1000)

		return expect(txPromise).resolves
			.toBe(true)
			:andThen(function()
				expect(txCommitted).toBe(true)
				return store:get("key1")
			end)
			:andThen(function(key1Data)
				return expect(key1Data).toEqual({ coins = 15 })
			end)
	end)

	it("should abort when transformFunction returns false", function()
		store:load("key1")
		store:load("key2")
		jest.advanceTimersByTime(1000)

		local txPromise = store:tx({ "key1", "key2" }, function(state)
			state.key1.coins += 10
			state.key2.coins += 10
			return false
		end)

		jest.advanceTimersByTime(1000)

		return expect(txPromise).resolves.toBe(false):andThen(function()
			local key1Data = store:get("key1")
			local key2Data = store:get("key2")
			jest.advanceTimersByTime(1000)

			return expect(key1Data).resolves.toEqual({ coins = 0 }):andThen(function()
				return expect(key2Data).resolves.toEqual({ coins = 0 })
			end)
		end)
	end)
end)
