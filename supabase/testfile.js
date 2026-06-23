import supabase from './client.js';

async function test() {
  const { data, error } = await supabase
    .from('trades')
    .select('*');

  console.log('DATA:', data);
  console.log('ERROR:', error);
}

test();