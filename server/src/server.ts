import 'dotenv/config';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`MPC Server running on http://127.0.0.1:${PORT}`);
});
