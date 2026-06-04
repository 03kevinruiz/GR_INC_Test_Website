import puppeteer from 'puppeteer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';
const dir = 'temporary screenshots';
if (!existsSync(dir)) mkdirSync(dir);

const files = existsSync(dir) ? (await import('fs')).readdirSync(dir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png')) : [];
const nums = files.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0')).filter(n => !isNaN(n));
const n = nums.length ? Math.max(...nums) + 1 : 1;
const filename = join(dir, `screenshot-${n}${label ? '-' + label : ''}.png`);

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2' });
await page.screenshot({ path: filename, fullPage: true });
await browser.close();
console.log(filename);
