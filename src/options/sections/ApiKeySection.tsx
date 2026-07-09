import { useEffect, useState } from "react";
import { getApiKey, setApiKey } from "../../lib/storage";

export default function ApiKeySection() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getApiKey().then((key) => key && setValue(key));
  }, []);

  async function handleSave() {
    await setApiKey(value);
    setSaved(true);
  }

  return (
    <section className="wb__clause">
      <div className="wb__clause-head">
        <span className="wb__clause-no">§ 01</span>
        <h2 className="wb__clause-title">Authorization</h2>
        <span className="wb__clause-rule" aria-hidden="true" />
      </div>
      <p className="wb__lede">
        Your Anthropic key stays on this machine. It's used to generate every résumé and cover letter you create.
      </p>

      <div className="wb__field">
        <label className="wb__label" htmlFor="wb-apikey">
          Anthropic API key
        </label>
        <input
          id="wb-apikey"
          className="wb__input"
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="sk-ant-..."
        />
      </div>

      <div className="wb__actions">
        <button className="wb__btn wb__btn--primary" onClick={handleSave}>
          Save
        </button>
        {saved && <p className="wb__stamp">Saved.</p>}
      </div>
    </section>
  );
}
