import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function testRoulette() {
    console.log("Testing roulette x100 times...");
    const stats: Record<number, number> = {};
    const multipliers: Record<number, number> = {};

    for(let i=0; i<100; i++) {
        const { data, error } = await supabase.rpc('spin_roulette', {
            user_id_param: '1', // Test user
            bet_param: 100,
            is_free: false
        });
        if(error) {
            console.error("Error:", error);
            continue;
        }
        const seg = data.segment_index;
        const win = data.win_amount;
        stats[seg] = (stats[seg] || 0) + 1;
        multipliers[seg] = win / 100;
    }
    console.log("Stats (segment: count):", stats);
    console.log("Multipliers found (segment: multiplier):", multipliers);
}

testRoulette();
