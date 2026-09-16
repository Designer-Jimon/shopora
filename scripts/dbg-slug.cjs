const BASE = process.env.API_BASE || 'http://localhost:3200';
const email = 'onboard-test@shopora.dev';
async function main(){
  // login
  let r = await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'OnboardPass123!'})});
  const c = r.headers.get('set-cookie').match(/shopora_session=([^;]*)/)[0];
  const cookie = `shopora_session=${c.split('=')[1]}`;
  console.log('login status', r.status);
  // get /me to see current slug + step
  r = await fetch(BASE+'/api/businesses/me',{headers:{cookie}});
  const me = await r.json();
  console.log('me:', JSON.stringify({slug:me.slug, step:me.onboardingStep, name:me.name}));
  // PATCH step 3 with a valid slug
  const body = JSON.stringify({ step:3, slug:'myvalid-slug-123' });
  r = await fetch(BASE+'/api/businesses/me',{method:'PATCH',headers:{cookie,'Content-Type':'application/json'},body});
  const txt = await r.text();
  console.log('PATCH status', r.status, 'body:', txt);
}
main().catch(e=>console.error(e));
