async function testRender() {
  console.log('Sending request to https://turfflow.onrender.com/api/email/send ...');
  try {
    const res = await fetch('https://turfflow.onrender.com/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'samarthsalgar02@gmail.com',
        subject: 'TurfFlow Render Test Delivery',
        text: 'This is a test from Render to samarthsalgar02@gmail.com'
      })
    });
    console.log('Status:', res.status, res.statusText);
    const data = await res.json();
    console.log('Data:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testRender();
