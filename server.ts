import dotenv from 'dotenv';
import express from 'express';
import locateHandler from './api/locate.js';
import planHandler from './api/plan.js';
import transcrireHandler from './api/transcrire.js';
import redactionHandler from './api/redaction.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));
app.post('/api/locate', locateHandler);
app.post('/api/plan', planHandler);
app.post('/api/transcrire', transcrireHandler);
app.post('/api/redaction', redactionHandler);

app.listen(3202, () => console.log('API locale sur http://localhost:3202'));
