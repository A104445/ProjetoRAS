try {
    console.log('Requiring mongoose...');
    require('mongoose');
    console.log('Mongoose required.');

    console.log('Requiring ../models/preset...');
    const m = require('../models/preset');
    console.log('Model required:', m);
} catch (e) {
    console.error(e);
}
