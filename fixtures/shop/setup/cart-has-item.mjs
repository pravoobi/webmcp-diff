/** Put the cart into the "has an item" state so conditional tools register. */
export default async function cartHasItem(page) {
  await page.click("#add-sample");
  await page.waitForFunction(() =>
    (document.getElementById("cart-count")?.textContent ?? "").startsWith("1"),
  );
}
