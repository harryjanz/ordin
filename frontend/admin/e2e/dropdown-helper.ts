import type { Page } from "@playwright/test";

// O design system substitui <select> nativo por um componente próprio
// (abre uma lista de botões ao clicar no input). Este helper reproduz a
// interação equivalente ao antigo `.selectOption(label)`.
export async function selectDropdownOption(page: Page, testId: string, optionLabel: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole("button", { name: optionLabel, exact: true }).click();
}
