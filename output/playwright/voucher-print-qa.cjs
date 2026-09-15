async page => {
 const html = await page.evaluate(()=>window.__printHtml);
 const preview = await page.context().newPage();
 await preview.setViewportSize({width:320,height:500});
 await preview.setContent(html);
 await preview.emulateMedia({media:'print'});
 await preview.screenshot({path:'output/playwright/voucher-print.png'});
 if(await preview.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Print overflow');
 await preview.close();
}
