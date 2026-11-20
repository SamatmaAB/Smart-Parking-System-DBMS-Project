// ============================================================================
// PES University - Department of Computer Science and Engineering
// DBMS Mini Project - Evaluation Component 4 & 9: NoSQL / Vector Database Creation
// File: mongo_setup.js
// Description: Initializes MongoDB collection with strict $jsonSchema validation,
//              creates compound/text indexes, and seeds operational vector notes.
// ============================================================================

const { MongoClient } = require('mongodb');

// Helper to compute a simple deterministic semantic vector embedding
function computeTextVector(text) {
  const vocab = [
    'charger', 'ev', 'broken', 'maintenance', 'barrier', 'gate', 'ticket',
    'sensor', 'ground', 'basement', 'vip', 'full', 'reserved', 'security',
    'camera', 'payment', 'upi', 'cash', 'overstay', 'slot', 'incident',
    'traffic', 'peak', 'fire', 'emergency', 'power', 'offline', 'handover'
  ];
  const lower = String(text || '').toLowerCase();
  const vector = vocab.map(term => {
    const count = (lower.match(new RegExp('\\b' + term, 'g')) || []).length;
    return count > 0 ? Number((1.0 + Math.log(count)).toFixed(4)) : 0.0;
  });
  // Normalize vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vector.map(v => Number((v / magnitude).toFixed(4)));
}

async function setupMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGODB_DATABASE || 'parkwise';

  console.log(`[NoSQL Init] Connecting to MongoDB instance at ${uri}...`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    console.log(`[NoSQL Init] Connected successfully to server.`);
    const db = client.db(dbName);

    // 1. Check if parking_notes collection already exists
    const collections = await db.listCollections({ name: 'parking_notes' }).toArray();
    if (collections.length > 0) {
      console.log(`[NoSQL Init] Collection 'parking_notes' exists. Updating schema validator...`);
      await db.command({
        collMod: 'parking_notes',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['title', 'note', 'category', 'createdBy', 'createdAt', 'updatedAt'],
            properties: {
              title: {
                bsonType: 'string',
                minLength: 3,
                maxLength: 120,
                description: 'Brief operational summary of the note'
              },
              note: {
                bsonType: 'string',
                minLength: 5,
                maxLength: 2500,
                description: 'Detailed handover, maintenance, or incident description'
              },
              category: {
                bsonType: 'string',
                enum: ['operations', 'maintenance', 'incident', 'ev_charging', 'security'],
                description: 'Must match one of the predefined operational categories'
              },
              priority: {
                bsonType: 'string',
                enum: ['low', 'medium', 'high', 'urgent'],
                description: 'Operational severity level'
              },
              tags: {
                bsonType: 'array',
                items: { bsonType: 'string' },
                description: 'Descriptive search tags'
              },
              vector: {
                bsonType: 'array',
                items: { bsonType: 'double' },
                description: 'High-dimensional semantic vector embedding for similarity search'
              },
              createdBy: {
                bsonType: 'string',
                description: 'Staff email who authored the note'
              },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' }
            }
          }
        },
        validationLevel: 'moderate'
      });
    } else {
      console.log(`[NoSQL Init] Creating collection 'parking_notes' with strict $jsonSchema validator...`);
      await db.createCollection('parking_notes', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['title', 'note', 'category', 'createdBy', 'createdAt', 'updatedAt'],
            properties: {
              title: { bsonType: 'string', minLength: 3, maxLength: 120 },
              note: { bsonType: 'string', minLength: 5, maxLength: 2500 },
              category: {
                bsonType: 'string',
                enum: ['operations', 'maintenance', 'incident', 'ev_charging', 'security']
              },
              priority: { bsonType: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
              tags: { bsonType: 'array', items: { bsonType: 'string' } },
              vector: { bsonType: 'array', items: { bsonType: 'double' } },
              createdBy: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' }
            }
          }
        }
      });
    }

    const coll = db.collection('parking_notes');

    // 2. Create Compound and Text Indexes for fast retrieval
    console.log(`[NoSQL Init] Creating compound and full-text indexes...`);
    await coll.createIndex({ category: 1, updatedAt: -1 }, { name: 'idx_category_updated' });
    await coll.createIndex({ priority: 1, createdAt: -1 }, { name: 'idx_priority_created' });
    await coll.createIndex({ title: 'text', note: 'text', tags: 'text' }, { name: 'idx_fulltext_notes' });

    // 3. Seed Sample Notes if empty
    const count = await coll.countDocuments();
    if (count === 0) {
      console.log(`[NoSQL Init] Seeding sample operational documents with vector embeddings...`);
      const sampleNotes = [
        {
          title: 'Basement B2 EV Charger #2 Disconnected',
          note: 'EV fast charging stall #2 in Basement B2 has a cable latch malfunction. Offline for maintenance until technical inspection.',
          category: 'ev_charging',
          priority: 'high',
          tags: ['ev', 'charger', 'maintenance', 'broken'],
          createdBy: 'admin@parkwise.local',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          title: 'Peak Weekend Traffic Shift Handover',
          note: 'Expect heavy traffic flow between 17:00 and 21:00 due to city mall anniversary sales. Reserve Ground floor bays 7 and 8 for VIP arrivals.',
          category: 'operations',
          priority: 'medium',
          tags: ['traffic', 'peak', 'ground', 'vip'],
          createdBy: 'attendant@parkwise.local',
          createdAt: new Date(Date.now() - 3600000),
          updatedAt: new Date(Date.now() - 3600000)
        },
        {
          title: 'Ultrasonic Sensor Log Glitch Slot #4',
          note: 'Ultrasonic occupancy sensor at slot #4 was intermittently reporting false positive occupied status. Firmware recalibrated.',
          category: 'maintenance',
          priority: 'low',
          tags: ['sensor', 'slot', 'maintenance'],
          createdBy: 'admin@parkwise.local',
          createdAt: new Date(Date.now() - 7200000),
          updatedAt: new Date(Date.now() - 7200000)
        },
        {
          title: 'Unauthorized Vehicle Blocking Lane 1',
          note: 'Vehicle KA-02-ZZ-7788 parked across lane divider near Terminal North P1. Violation fine of ₹100 issued and vehicle guided to bay.',
          category: 'security',
          priority: 'urgent',
          tags: ['incident', 'security', 'overstay', 'violation'],
          createdBy: 'attendant@parkwise.local',
          createdAt: new Date(Date.now() - 10800000),
          updatedAt: new Date(Date.now() - 10800000)
        }
      ];

      const docsWithVectors = sampleNotes.map(n => ({
        ...n,
        vector: computeTextVector(`${n.title} ${n.note} ${(n.tags || []).join(' ')}`)
      }));

      await coll.insertMany(docsWithVectors);
      console.log(`[NoSQL Init] Inserted ${docsWithVectors.length} initial operational notes.`);
    }

    console.log(`[NoSQL Init] MongoDB database '${dbName}' and collection 'parking_notes' successfully configured!`);
  } catch (error) {
    console.error(`[NoSQL Init] MongoDB setup failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

setupMongo();
