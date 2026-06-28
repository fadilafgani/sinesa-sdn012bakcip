const https = require('https');

function poll() {
  https.get('https://sinesa-sdn012bakcip.com/api/list_uploads.php', (res) => {
    if (res.statusCode === 200) {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log('DIAGNOSTICS RESULT:');
          console.log(JSON.stringify(data, null, 2));
        } catch (e) {
          console.log('Received response but not JSON yet. Retrying...');
          setTimeout(poll, 5000);
        }
      });
    } else {
      console.log(`Status is ${res.statusCode}. Waiting for deployment...`);
      setTimeout(poll, 5000);
    }
  }).on('error', (e) => {
    console.error('Error fetching:', e.message);
    setTimeout(poll, 5000);
  });
}

console.log('Polling list_uploads.php...');
poll();
