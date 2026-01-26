const express = require('express');
const app = express();
const port = 4000;

app.get('/', (req, res) => {
  res.send('Express server is running!');
});

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
