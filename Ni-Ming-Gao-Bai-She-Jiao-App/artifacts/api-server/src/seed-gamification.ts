import { seedGamificationData } from './seed/gamification';

async function main() {
  try {
    console.log('⏳ Seeding gamification data...');
    await seedGamificationData();
    console.log('✅ Gamification data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding gamification data:', error);
    // 如果種子失敗不應該阻止構建，因為數據可能已經存在
    console.log('⚠️  Continuing build despite seed error (data may already exist)');
    process.exit(0);
  }
}

main();
