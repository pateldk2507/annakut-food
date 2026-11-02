import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseline = process.argv.includes("--baseline");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
assert.ok(fs.existsSync(chromePath), "Set CHROME_PATH to a Chrome/Chromium executable");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build the real app in memory with isolated authentication and API fixtures.
const bundle = await build({
  root: path.join(root, "client"), configFile: false, envFile: false, logLevel: "error",
  build: { write: false },
  plugins: [react(), {
    name: "admin-availability-fixtures", enforce: "pre", load(id) {
      if (/client[\\/]src[\\/]lib[\\/]firebase\.js$/.test(id)) return `
        export function onAuthChanged(callback) { queueMicrotask(() => callback({uid:'admin-test',email:'admin@example.invalid'})); return () => {}; }
        export async function getCurrentIdToken() { return 'test-token'; }
        export async function registerWithEmailPassword() {}
        export async function sendFirebasePasswordReset() {}
        export async function signInWithEmailPassword() {}
        export async function signOutFirebaseUser() {}
      `;
      if (baseline && /client[\\/]src[\\/]App\.jsx$/.test(id)) {
        return execFileSync("git", ["show", "HEAD:client/src/App.jsx"], { cwd: root, encoding: "utf8" });
      }
    },
  }],
});
const script = bundle.output.find((file) => file.fileName.endsWith(".js")).code;
const styles = bundle.output.find((file) => file.fileName.endsWith(".css")).source;
const fixtures = `
  localStorage.clear();
  sessionStorage.setItem('annakut_rules_ack_admin-test','true');
  window.confirm = () => true;
  const menuItems = [
    {id:'own',name:'Kheer'}, {id:'gulab',name:'Gulab Jamun'},
    {id:'free',name:'Jalebi'}, {id:'cancelled',name:'Barfi'},
    {id:'held',name:'Halwa'}, {id:'renamed-id',name:'Ladoo'},
    {id:'pickup',name:'Penda'}, {id:'late',name:'Shrikhand'},
  ];
  const devotee = {full_name:'Test Devotee',phone:'8075550100',email:'devotee@example.invalid',address:'Test Street, Thunder Bay'};
  const makeOrder = (id, items, status = 'received') => ({id,uid:id,receipt_no:id,devotee,items,status,containers_required:items.length,created_at:'2026-11-01 12:00:00'});
  window.testOrders = [
    makeOrder('order-a',[{item_id:'own',name:'Kheer'}]),
    makeOrder('order-b',[{item_id:'gulab',name:'Gulab Jamun'},{id:'old-id',name:'Ladoo'}]),
    makeOrder('order-c',[{id:'cancelled',name:'Barfi'}],'cancelled'),
    makeOrder('order-d',[{id:'pickup',name:'Penda'}],'pickup'),
  ];
  window.testHeld = ['held'];
  window.testFailAvailability = false;
  window.testDelayAvailability = 0;
  window.testAvailabilityRequests = 0;
  window.testSaves = [];
  window.fetch = async (input, options = {}) => {
    const route = new URL(input, location.href).pathname;
    let data = {ok:true}, status = 200;
    if (route === '/api/menu') data.categories = [{id:'sweets',name:'Sweets',subcategories:[{id:'general',name:'General',items:menuItems}]}];
    else if (route === '/api/profile') data.profile = {...devotee,permission:'annakut_admin'};
    else if (route === '/api/admin/me') data.permission = 'annakut_admin';
    else if (route === '/api/admin/accounts') data.accounts = [];
    else if (route === '/api/find-offerings') data.offerings = [];
    else if (route === '/api/admin/offerings') {
      window.testAvailabilityRequests++;
      if (window.testDelayAvailability) await new Promise(resolve=>setTimeout(resolve,window.testDelayAvailability));
      if (window.testFailAvailability) {data = {ok:false,error:'Test offline'};status = 503;}
      else data.offerings = window.testOrders;
    }
    else if (route === '/api/booked-items') data = {ok:true,held_item_ids:window.testHeld,taken_item_ids:window.testOrders.filter(order=>order.status!=='cancelled').flatMap(order=>order.items.map(item=>item.id||item.item_id))};
    else if (route.startsWith('/api/admin/offerings/') && options.method === 'PATCH') {
      const id = route.split('/').pop();
      const payload = JSON.parse(options.body);
      window.testSaves.push({id,...payload});
      const offering = window.testOrders.find(order=>order.id===id);
      offering.items = payload.items;
      data = {ok:true,offering,email_sent:true};
    }
    else if (!['/api/settings','/api/admin/item-requests','/api/admin/suggestions','/api/sync-holds','/api/release-holds'].includes(route)) throw new Error('Unexpected request: '+route);
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
`;
const server = http.createServer((req, res) => {
  if (req.url === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(script); }
  else if (req.url === "/app.css") { res.setHeader("Content-Type", "text/css"); res.end(styles); }
  else if (/\.(png|webp|jpg|jpeg|ico)$/.test(req.url)) { res.statusCode = 204; res.end(); }
  else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>${fixtures}</script><script type="module" src="/app.js"></script></body></html>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "annakut-availability-"));
const chrome = spawn(chromePath, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let socket;
let command;
const errors = [];
try {
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; !fs.existsSync(portFile) && attempt < 100; attempt++) await delay(100);
  assert.ok(fs.existsSync(portFile), "Chrome started");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((entry) => entry.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once:true}); socket.addEventListener("error", reject, {once:true}); });
  let counter = 0;
  const pending = new Map();
  socket.addEventListener("message", ({data}) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (!pending.has(message.id)) return;
    const {resolve, reject, timer} = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => {
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
    throw new Error(`Condition not reached: ${expression}\n${await evaluate("document.body.innerText")}`);
  };
  const search = async (value) => {
    await evaluate(`(() => { const input=document.querySelector('.admin-order-item-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await delay(80);
  };
  const resultNames = () => evaluate(`[...document.querySelectorAll('.admin-order-search-results button strong')].map(element=>element.textContent)`);
  const openOrder = async (id) => {
    await evaluate(`[...document.querySelectorAll('.admin-mobile-card')].find(card=>card.textContent.includes(${JSON.stringify(id)})).querySelector('.admin-inline-actions button').click()`);
    await until("document.querySelector('.admin-order-item-search input')");
  };
  const closeOrder = async () => {
    await evaluate("document.querySelector('.modal-close').click()");
    await until("!document.querySelector('.admin-edit-modal')");
  };
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await command("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/`});
  await until(`[...document.querySelectorAll('.selection-tile')].some(button=>button.querySelector('strong')?.textContent==='Admin')`);
  await evaluate(`[...document.querySelectorAll('.selection-tile')].find(button=>button.querySelector('strong')?.textContent==='Admin').click()`);
  await until("document.querySelectorAll('.admin-mobile-card').length === 4");
  await openOrder("order-a");
  await search("Gulab");
  if (baseline) {
    assert.deepEqual(await resultNames(), ["Gulab Jamun"]);
    console.log("PASS: Original code reproduces Gulab Jamun being offered despite belonging to another order.");
  } else {
    await until("document.querySelector('.admin-order-search-results [role=status]')");
    assert.deepEqual(await resultNames(), [], "Taken Gulab Jamun is hidden");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-order-search-results [role=status]')).color"), "rgb(61, 29, 19)", "Empty search message has readable text on the light background");
    await search("Sweets");
    assert.deepEqual(await resultNames(), ["Jalebi", "Barfi", "Shrikhand"], "Hide own, received, pickup, legacy-name and held items; allow cancelled items");
    await evaluate("document.querySelector('[aria-label=\"Remove Kheer\"]').click()");
    await search("Kheer");
    assert.deepEqual(await resultNames(), ["Kheer"], "Own removed item can be restored");
    await evaluate("document.querySelector('.admin-order-search-results button').click()");
    await search("Kheer");
    assert.deepEqual(await resultNames(), [], "Selected item cannot be added twice");
    console.log("PASS: Taken/held items hidden, cancelled items available, and own items can be removed and restored.");

    await search("Shrikhand");
    await evaluate("window.testOrders[1].items.push({item_id:'late',name:'Shrikhand'})");
    await until("document.querySelector('.admin-order-search-results [role=status]')");
    assert.deepEqual(await resultNames(), [], "Polling removes a newly booked item");
    await evaluate("window.testHeld=[]; window.dispatchEvent(new Event('focus'))");
    await search("Halwa");
    await until("document.querySelector('.admin-order-search-results button')");
    assert.deepEqual(await resultNames(), ["Halwa"], "Released hold becomes available");
    console.log("PASS: Availability refreshes while editing and after returning to the window.");

    await evaluate("window.testFailAvailability=true; window.dispatchEvent(new Event('focus'))");
    await until("document.querySelector('.admin-order-item-search [role=alert]')");
    await search("Jalebi");
    assert.deepEqual(await resultNames(), [], "Failed refresh must not offer stale results");
    await evaluate("window.testFailAvailability=false; document.querySelector('.admin-order-item-search [role=alert] button').click()");
    await until("document.querySelector('.admin-order-search-results button')");
    assert.deepEqual(await resultNames(), ["Jalebi"]);
    await evaluate("document.querySelector('.admin-order-search-results button').click()");
    await evaluate("document.querySelector('.admin-edit-modal button[type=submit]').click()");
    await until("!document.querySelector('.admin-edit-modal') && window.testSaves.length === 1");
    assert.deepEqual(await evaluate("window.testSaves[0].items.map(item=>item.id||item.item_id)"), ["own", "free"]);
    console.log("PASS: Failed checks hide suggestions, Retry recovers, and adding/saving an available item works.");

    await command("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await openOrder("order-c");
    await search("Jalebi");
    await until("document.querySelector('.admin-order-search-results [role=status]')");
    assert.deepEqual(await resultNames(), [], "An admin-added item is unavailable to another order on mobile");
    await closeOrder();
    await evaluate("window.testDelayAvailability=500");
    await openOrder("order-a");
    await search("Gulab");
    assert.deepEqual(await resultNames(), [], "No unchecked suggestions during initial loading");
    await closeOrder();
    await delay(600);
    const requestCount = await evaluate("window.testAvailabilityRequests");
    await delay(3300);
    assert.equal(await evaluate("window.testAvailabilityRequests"), requestCount, "Closing the editor stops polling");
    console.log("PASS: Mobile filtering, initial loading, and editor cleanup work.");
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  if (command) await command("Browser.close").catch(() => {});
  socket?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  // Only delete the unique temporary profile created by this test.
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(profile).startsWith("annakut-availability-"));
  fs.rmSync(profile, {recursive:true,force:true,maxRetries:10,retryDelay:200});
}
