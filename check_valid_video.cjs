const https = require('https');

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://sinesa-sdn012bakcip.com/',
    'Origin': 'https://sinesa-sdn012bakcip.com'
  }
};

https.get('https://sinesa-sdn012bakcip.com/uploads/quiz-videos/1534f2f7-6be4-4064-a78d-e9a929639d1d.mp4', options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('BODY CONTENT:');
    console.log(body);
  });
}).on('error', (e) => {
  console.error(e);
});
