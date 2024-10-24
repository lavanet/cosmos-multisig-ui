import { DetailedHTMLProps, InputHTMLAttributes } from "react";

interface InputProps
  extends DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  label?: string;
  error?: string;
  selectOptions?: Array<{ value: string; label: string }>; // Array of options for the dropdown
  selectValue?: string;
  onSelectChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const Input = (props: InputProps) => (
  <div className="text-input">
    <label>{props.label || ""}</label>
    <div className="input-select-wrapper">
      <input
        type={props.type || "text"}
        list={props.list}
        name={props.name || "text-input"}
        onChange={props.onChange}
        onFocus={props.onFocus}
        value={props.value}
        checked={props.checked}
        min={props.type === "datetime-local" ? props.min : undefined}
        placeholder={props.placeholder || ""}
        autoComplete="off"
        onBlur={props.onBlur}
        disabled={props.disabled}
        style={props.style}
      />
      {props.selectOptions && (
        <select
          className="select-unit"
          value={props.selectValue}
          onChange={props.onSelectChange}
        >
          {props.selectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
    {props.error && <div className="error">{props.error}</div>}
    <style jsx>{`
      .text-input {
        width: ${props.width ? props.width : "auto"};
        display: flex;
        flex-direction: ${props.type === "checkbox" ? "row" : "column"};
        gap: ${props.type === "checkbox" ? "8px" : 0};
      }

      .input-select-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .input-select-wrapper input {
        font-family: Arial;
        font-size: 13.3333px;
        line-height: normal;
        width: 100%;
        padding-right: 80px; /* Space for the select dropdown */
      }

      label {
        color: white;
        font-style: italic;
        font-size: 12px;
        margin-bottom: ${props.type === "checkbox" ? 0 : "1em"};
      }

      input {
        background: #722d6f;
        border: 2px solid rgba(255, 255, 255, 0.5);
        box-sizing: border-box;
        border-radius: 9px;
        color: white;
        padding: 10px 5px;
      }

      .select-unit {
        position: absolute;
        right: 5px;
        top: 50%;
        transform: translateY(-50%);
        background: #722d6f;
        // border: 2px solid rgba(255, 255, 255, 0.5);
        border-left: 2px solid rgba(255, 255, 255, 0.5);
        // border-radius: 9px;
        color: white;
        padding: 8px 5px;
        font-size: 13.3333px;
        outline: none;
        appearance: none;
        cursor: pointer;
      }

      .select-unit:hover ~ .input-select-wrapper,
      .select-unit:focus ~ .input-select-wrapper {
        border-color: rgba(255, 255, 255, 1);
      }

      input:hover,
      input:focus {
        border-color: rgba(255, 255, 255, 1);
      }
        .select-unit:hover ~ .input-select-wrapper,
      .select-unit:focus ~ .input-select-wrapper {
        border-color: rgba(255, 255, 255, 1);
      }
          .input-select-wrapper input:hover ~ .select-unit,
  .input-select-wrapper input:focus ~ .select-unit {
    border-color: rgba(255, 255, 255, 1);
  }
        .input-select-wrapper input:hover ~ .select-unit,
  .input-select-wrapper input:focus ~ .select-unit {
    border-color: rgba(255, 255, 255, 1);
  }

      input::placeholder {
        color: rgba(255, 255, 255, 0.3);
      }

      input[type="datetime-local"]::-webkit-calendar-picker-indicator {
        cursor: pointer;
        opacity: 0.6;
        filter: invert(0.8);
      }

      input[type="datetime-local"]::-webkit-calendar-picker-indicator:hover {
        opacity: 1;
      }

      .error {
        font-size: 12px;
        color: coral;
        margin-top: 5px;
      }
    `}</style>
  </div>
);

export default Input;
