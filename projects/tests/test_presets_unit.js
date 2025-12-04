const assert = require('assert');
const presetController = require('../controllers/preset');
const PresetModel = require('../models/preset');

// Mock Mongoose Model
const mockDb = [];
PresetModel.create = async (data) => {
    const newPreset = { ...data, _id: 'mock_id_' + Date.now(), created_at: new Date() };
    mockDb.push(newPreset);
    return newPreset;
};
PresetModel.find = (query) => {
    const results = mockDb.filter(p => p.user_id === query.user_id);
    return {
        sort: () => ({
            exec: async () => results
        })
    };
};
PresetModel.findOne = (query) => {
    const result = mockDb.find(p => p.user_id === query.user_id && p._id === query._id);
    return {
        exec: async () => result
    };
};
PresetModel.updateOne = async (query, data) => {
    const index = mockDb.findIndex(p => p.user_id === query.user_id && p._id === query._id);
    if (index !== -1) {
        mockDb[index] = { ...mockDb[index], ...data };
        return { nModified: 1 };
    }
    return { nModified: 0 };
};
PresetModel.deleteOne = async (query) => {
    const index = mockDb.findIndex(p => p.user_id === query.user_id && p._id === query._id);
    if (index !== -1) {
        mockDb.splice(index, 1);
        return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
};

async function runTests() {
    console.log('Starting Preset Controller Tests...');
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

    console.log('All Controller Tests Passed!');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
