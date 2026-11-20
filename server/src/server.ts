import 'dotenv/config';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT) || PORT;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`MPC Server running on http://${HOST}:${PORT}`);
  console.log(`Open MPC Dashboard at: http://localhost:${PUBLIC_PORT}`);
});

