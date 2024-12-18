import Spinner from "../Spinner";

interface Props {
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  href?: string;
  label: string;
  featureLabel?: string; // Optional feature mark
  onClick?: () => void;
}

const Button = (props: Props) => (
  <>
    {props.href ? (
      <a className={props.primary ? "primary button" : "button"} href={props.href}>
        <div className="button-content">
          {props.label}
          {props.featureLabel && <span className="feature-mark">{props.featureLabel}</span>}
        </div>
      </a>
    ) : (
      <button
        className={props.primary ? "primary button" : "button"}
        onClick={props.disabled || props.loading ? undefined : props.onClick}
        disabled={props.disabled}
        data-loading={props.loading}
      >
        {props.loading ? (
          <div className="button-cluster">
            <Spinner />
            <div className="button-content">
              {props.label}
              {props.featureLabel && <span className="feature-mark">{props.featureLabel}</span>}
            </div>
          </div>
        ) : (
          <div className="button-content">
            {props.label}
            {props.featureLabel && <span className="feature-mark">{props.featureLabel}</span>}
          </div>
        )}
      </button>
    )}
    <style jsx>{`
      .button {
        display: block;
        position: relative;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        padding: 12px;
        font-size: 1rem;
        color: white;
        font-style: italic;
        margin-top: 20px;
        text-decoration: none;
        text-align: center;
        padding-right: 32px; /* Add space for the feature label */
      }
      .primary {
        border: 2px solid white;
      }
      button:hover,
      button:focus {
        outline: 1px solid white;
      }
      button:first-child {
        margin-top: 0;
      }
      button:disabled,
      button[data-loading="true"] {
        opacity: 0.5;
        cursor: initial;
      }
      .button-cluster {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .button-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .feature-mark {
        position: absolute;
        top: 0px;
        right: 0px;
        font-size: 0.6rem;
        font-style: italic;
        color: white;
        padding: 2px 6px;
        z-index: 1;
      }
    `}</style>
  </>
);

export default Button;
