import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CustomSelect from "./CustomSelect";

function Example() {
  const [value, setValue] = useState("");
  return (
    <>
      <CustomSelect
        ariaLabel="Status filter"
        value={value}
        onChange={setValue}
        options={[
          { value: "", label: "All Statuses" },
          { value: "New", label: "New" },
          { value: "Closed", label: "Closed" },
        ]}
      />
      <button>Outside</button>
    </>
  );
}
describe("Rounded select keyboard interaction", () => {
  it("opens with the keyboard, cancels without changing selection, and selects with Enter", () => {
    render(<Example />);
    const select = screen.getByRole("combobox");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "End" });
    fireEvent.keyDown(select, { key: "Escape" });
    expect(select).toHaveTextContent("All Statuses");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "Enter" });
    expect(select).toHaveTextContent("New");
    expect(select).toHaveFocus();
  });
  it("supports pointer selection, typeahead and outside dismissal", () => {
    render(<Example />);
    const select = screen.getByRole("combobox");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "Closed" }));
    expect(select).toHaveTextContent("Closed");
    fireEvent.keyDown(select, { key: "n" });
    fireEvent.keyDown(select, { key: "Enter" });
    expect(select).toHaveTextContent("New");
    fireEvent.click(select);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(select).toHaveAttribute("aria-expanded", "false");
  });
});
