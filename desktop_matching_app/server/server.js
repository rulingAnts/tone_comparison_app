const express = require('express');
const path = require('path');
const apiRouter = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRouter);

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Desktop Matching PWA server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
