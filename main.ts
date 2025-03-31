import chalk from 'chalk';
import figlet from 'figlet';
import prompts from 'prompts';
import { execute as execute7kswap } from './7kswap'; // 7kswap dosyası
import readline from 'readline';

// Banner fonksiyonu
function printBanner() {
    console.log(chalk.blue(figlet.textSync('Sui Trading Bot', { horizontalLayout: 'full' })));
}

// Modüller listesi
const modules = [
    { name: '7kswap', execute: execute7kswap }
];

// Rastgele bir süre bekleme fonksiyonu (1-3 dakika arası)
function waitRandomTime() {
    const min = 1 * 60 * 1000; // 1 dakika
    const max = 3 * 60 * 1000; // 3 dakika
    const randomTime = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, randomTime));
}

async function runModules() {
    for (const module of modules) {
        console.log(chalk.green(`Running ${module.name} module...`));
        await module.execute();
        console.log(chalk.green(`${module.name} module completed.`));
    }
}

async function main() {
    printBanner();

    // Kullanıcıdan modül listesini göster
    console.log(chalk.yellow('Available modules:'));
    modules.forEach(module => console.log(`- ${module.name}`));

    // Kullanıcıdan sonsuz döngü modu seçimi
    const infiniteLoopResponse = await prompts({
        type: 'confirm',
        name: 'infiniteLoop',
        message: 'Do you want to run in infinite loop mode?',
        initial: false
    });

    if (infiniteLoopResponse.infiniteLoop) {
        console.log(chalk.yellow('Running in infinite loop mode. Press Ctrl+C to stop.'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // SIGINT sinyalini yakala ve programı sonlandır
        process.on('SIGINT', () => {
            console.log(chalk.yellow('\nInfinite loop mode stopped.'));
            rl.close();
            process.exit(0);
        });

        while (true) {
            try {
                await runModules();
                console.log(chalk.yellow('Waiting for a random time between 1-3 minutes before running the next cycle...'));
                await waitRandomTime();
            } catch (error) {
                console.error(chalk.red('An error occurred:'), error);
                console.log(chalk.yellow('Waiting for a random time between 1-3 minutes before retrying...'));
                await waitRandomTime();
            }
        }
    } else {
        console.log(chalk.yellow('Running in single run mode...'));
        await runModules();
        console.log(chalk.green('Single run completed.'));
    }
}

main();
