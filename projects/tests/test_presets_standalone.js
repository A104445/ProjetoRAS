const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Define Mock Model
const mockDb = [];
const mockPresetModel = {
    create: async (data) => {
        const newPreset = { ...data, _id: 'mock_id_' + Date.now(), created_at: new Date() };
        mockDb.push(newPreset);
        return newPreset;
    },
    find: (query) => {
        const results = mockDb.filter(p => p.user_id === query.user_id);
        return {
            sort: () => ({
                exec: async () => results
            })
        };
    },
    findOne: (query) => {
        const result = mockDb.find(p => p.user_id === query.user_id && p._id === query._id);
        return {
            exec: async () => result
        };
    },
    updateOne: async (query, data) => {
        const index = mockDb.findIndex(p => p.user_id === query.user_id && p._id === query._id);
        if (index !== -1) {
            mockDb[index] = { ...mockDb[index], ...data };
            return { nModified: 1 };
        }
        return { nModified: 0 };
    },
    deleteOne: async (query) => {
        const index = mockDb.findIndex(p => p.user_id === query.user_id && p._id === query._id);
        if (index !== -1) {
            mockDb.splice(index, 1);
            return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
    }
};

// 2. Load Controller Code and Inject Mock
const controllerPath = path.join(__dirname, '../controllers/preset.js');
let controllerCode = fs.readFileSync(controllerPath, 'utf8');

// Replace require with our mock
// The controller has: const Preset = require("../models/preset");
// We replace it to use our mock object.
controllerCode = controllerCode.replace(
    'require("../models/preset")',
    'mockPresetModel'
);

// Wrap in a function to execute
const runController = new Function('mockPresetModel', 'module', controllerCode);

const moduleMock = { exports: {} };
runController(mockPresetModel, moduleMock);
const presetController = moduleMock.exports;

// 3. Run Tests
async function runTests() {
    console.log('Starting Standalone Preset Controller Tests...');
    const userId = 'user_123';

    // Test 1: Create Preset
    console.log('Test 1: Create Preset');
    const presetData = { user_id: userId, name: 'My Preset', tools: [{ name: 'crop' }] };
    const created = await presetController.create(presetData);
    assert.strictEqual(created.name, 'My Preset');
    assert.strictEqual(created.user_id, userId);
    console.log('  PASS');

    // Test 2: List Presets
    console.log('Test 2: List Presets');
    const list = await presetController.getAll(userId);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'My Preset');
    console.log('  PASS');

    // Test 3: Update Preset
    console.log('Test 3: Update Preset');
    await presetController.update(userId, created._id, { name: 'Updated Preset' });
    const updated = await presetController.getOne(userId, created._id);
    assert.strictEqual(updated.name, 'Updated Preset');
    console.log('  PASS');

    // Test 4: Delete Preset
    console.log('Test 4: Delete Preset');
    await presetController.delete(userId, created._id);
    const listAfterDelete = await presetController.getAll(userId);
    assert.strictEqual(listAfterDelete.length, 0);
    console.log('  PASS');

    console.log('All Standalone Tests Passed!');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
