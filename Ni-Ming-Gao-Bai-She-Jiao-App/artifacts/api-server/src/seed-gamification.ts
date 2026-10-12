import { seedGamificationData } from './seed/gamification';

async function main() {
  try {
    await seedGamificationData();
    console.log('✅ Gamification data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding gamification data:', error);
    process.exit(1);
  }
}

main();
