import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nkooezjjgmqcytndswui.supabase.co';
const supabaseAnonKey = 'sb_publishable_ouAXxxgJ3rPOvKzKlAbq0A_KgMpWQmM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    // 1. Fetch one participant row to target
    const { data: participants, error: fetchErr } = await supabase.from('participants').select('*').limit(1);
    if (fetchErr || !participants || participants.length === 0) {
      console.error('Failed to fetch a participant:', fetchErr);
      process.exit(1);
    }
    const targetPart = participants[0];
    const partId = targetPart.id;
    console.log('Target Participant ID:', partId);
    console.log('Initial Score:', targetPart.score);

    // 2. Set up realtime channel for participant updates
    const channel = supabase
      .channel(`test_part_updates:${partId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'participants',
        filter: `id=eq.${partId}`,
      }, (payload) => {
        console.log('>>> RECEIVED PARTICIPANT UPDATE EVENT:', payload.new);
      })
      .subscribe((status, err) => {
        console.log('Subscription Status:', status, err);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed! Updating participant score in 2 seconds...');
          setTimeout(async () => {
            const nextScore = targetPart.score + 1;
            console.log(`Updating participant score to: ${nextScore}...`);
            const { data, error: updateErr } = await supabase
              .from('participants')
              .update({ score: nextScore })
              .eq('id', partId)
              .select();
            if (updateErr) {
              console.error('Update error:', updateErr);
            } else {
              console.log('Update query returned data:', data);
              console.log('Update query executed successfully! Waiting 5 seconds for realtime event...');
            }
          }, 2000);
        }
      });

    // Keep process alive for 10 seconds
    setTimeout(() => {
      console.log('Timeout reached. Exiting.');
      supabase.removeChannel(channel);
      process.exit(0);
    }, 10000);

  } catch (e) {
    console.error('Exception:', e);
    process.exit(1);
  }
}

run();
