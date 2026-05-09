require('dotenv').config();

const app = require('./app');
const { connectDb } = require('./config/db');

const port = Number(process.env.PORT) || 3000;

async function start() {
  await connectDb();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
