import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WizardSteps from "../WizardSteps";

const STEPS = [
  { label: "Dados cadastrais", sub: "CNPJ" },
  { label: "Endereço", sub: "Receita" },
  { label: "Contatos", sub: "Comercial" },
];

describe("WizardSteps", () => {
  it("marca o passo atual e permite navegar para passos já alcançados", () => {
    const onSelect = vi.fn();
    render(<WizardSteps steps={STEPS} current={1} maxReached={1} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Dados cadastrais"));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("bloqueia navegação para passos ainda não alcançados", () => {
    const onSelect = vi.fn();
    render(<WizardSteps steps={STEPS} current={0} maxReached={0} onSelect={onSelect} />);

    const contactsButton = screen.getByText("Contatos").closest("button")!;
    expect(contactsButton).toBeDisabled();
    fireEvent.click(contactsButton);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
