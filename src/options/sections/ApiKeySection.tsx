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
    <fieldset>
      <legend>Anthropic API Key</legend>
      <input
        type="password"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="sk-ant-..."
      />
      <button onClick={handleSave}>Save</button>
      {saved && <p>Saved.</p>}
    </fieldset>
  );
}
