import { useEffect, useState } from "react";

const cookingGuidelines = [
  "1.રસોઈ બનાવનાર હરિભક્ત સ્નાન કરી, સ્વચ્છ ધોયેલા વસ્ત્રો પહેરીને રસોઇ બનાવવી. રસોઇ દરમયાન શૌચવિધિ જવાનું થાય તો વસ્ત્ર બદલી સ્નાન કરી લેવું. બાથરૂમ જવાનું થાય તો વ્યવસ્થિત હાથ ધોવા.*",
  "2.જો હરિભક્ત ને ત્યાં નાના બાળક હોય તો તેના Diaper વગેરે બદલાવો તો સ્નાન કરવં અનિવાર્ય છે.*",
  "3.ઠાકોરજી ની રસોઇ બનાવતી વખતે રસોડા ના કાઉન્ટર ઉપર કોઈ પણ એઠી વસ્તુ ન રાખવી.*",
  "4.રસોઇ બનાવવા માટે ધાતુ (સ્ટીલ, એલ્યુમિનિયમ, તાંબુ) ના વાસણોનો જ ઉપયોગ કરવો. પ્લાસ્ટીક અથવા લાકડાના વાસણો તદ્દન ન જ વાપરવા.*",
  "5.રસોઇમાં વાપરવા માટે મસાલા (મીઠું, મરચુ, ખાંડ વગેરે) રોજીંદા વપરાશના ડબ્બાઓ માંથી ન વાપરવા. પરંતુ નવા સ્ટોક માંથી, ધોયેલી સ્ટીલની વાટકીઓમાં કાઢીને વાપરવા. આ મસાલાઓ માં ડુંગળી, લસણ કે હિંગ ન આવી જાય તેનું ધ્યાન રાખવું.*",
  "6.રસોઇમાં વાપરવા માટે અન્ય પદાર્થમાં બીફ (Beef), લાર્ડ (Lard), ઇડા (Eggs), જીલેટીન (Gelatin), ડુંગળી (Onion), લસણ (Garlic), હિંગ (Asafetida) કે (Lecithin) ન હોય તેની ખાસ કાળજી રાખવી. Soy Lethicin નો ઉપયોગ કરી શકાય છે.*",
  "7.સામાન્ય રીતે પેકેટ પર Ingredients માં ફક્ત Spices લખ્યું હોય તેમાં મોટે ભાગે ડુંગળી નો પાઉડર કે હિંગ હોય છે. માટે તેવી વાનગીઓ કે મસાલાનો ઉપયોગ ન જ કરવો. બહાર ના અથાણાં મસાલા ન વાપરવા, કારણ કે એમા હિંગ આવે. ફક્ત શાયોના સ્ટોર ના જ મસાલા વાપરી શકાશે.*",
  "8.વરખવાળી મીઠાઇ પણ ન જ લાવવી તથા ઘરે બનાવેલ મીઠાઈ ઉપર કે રસોઇમાં અન્યત્ર વરખનો ઉપયોગ ન જ કરવો.*",
  "9.Cheese માં Animal-Rennet, Enzymes (Unspecified) કે Rennet (Unspecified) જેવા ingredient હોય તેવી ચીઝનો ઉપયોગ ન જ કરવો. જે ચીઝના Ingredients માં Non-Animal Rennet તથા Microbial Rennet હોય તેવી ચીઝનો ઉપયોગ કરી શકાય.*",
  "10.માસિક ધર્મમાં હોય તે બહેનોએ પહેલા ત્રણ દિવસ દરમ્યાન શિક્ષાપત્રીની આજ્ઞા મુજબ રસોઇ બનાવવી નહિ. ચોથા દિવસે સ્નાન કરી, સ્વચ્છ વસ્ત્રો પહેરીને રસોઇ બનાવવી.*",
  "11.રસોઇ બનાવતી વખતે જો રસોઇ ચાખવાની જરૂર પડે તો, ચાખ્યા બાદ તરત જ હાથ ધોઈ નાખવા તથા ચાખવા માટે વપરાયેલ ચમચી કે અન્ય વાસણ પણ ધોવામાં મૂકી દેવું પરંતુ ફરી તે વાસણ ચાખવા માટે કે રસોઇના વપરાશમાં ન લેવું. ચોખ્ખુ વાસણ જ વપરાશમાં લેવું.*",
];

export default function MinimumRequirements({ error, loading, onBack, onSubmit, saving }) {
  const [checkedRequirements, setCheckedRequirements] = useState(() => cookingGuidelines.map(() => false));
  const [accepted, setAccepted] = useState(false);
  const busy = saving || loading;
  const canSubmit = accepted && checkedRequirements.every((checked) => checked) && !busy;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (canSubmit) onSubmit(accepted, checkedRequirements);
  }

  function setRequirementChecked(index, checked) {
    setCheckedRequirements((current) => current.map((value, requirementIndex) => requirementIndex === index ? checked : value));
  }

  return (
    <form className="requirements-form" onSubmit={handleSubmit}>
      <section aria-labelledby="commitment-notice-title" className="requirements-notice">
        <h2 id="commitment-notice-title">Important Commitment Notice</h2>
        <h3 id="cooking-guidelines-title"><span lang="gu">ઠાકોરજી ની રસોઈ અંગે માર્ગદશન</span> (Cooking Guidelines)</h3>
        <ol aria-labelledby="cooking-guidelines-title" className="requirements-list" lang="gu" role="list">
          {cookingGuidelines.map((guideline, index) => (
            <li key={guideline}>
              <label className="requirement-check">
                <input checked={checkedRequirements[index]} disabled={busy} name={`requirement_${index + 1}`} onChange={(event) => setRequirementChecked(index, event.target.checked)} required type="checkbox" />
                <span>{guideline}</span>
              </label>
            </li>
          ))}
        </ol>
      </section>

      <label className={`requirements-acknowledgment ${accepted ? "accepted" : ""}`}>
        <input checked={accepted} disabled={busy} name="requirements_accepted" onChange={(event) => setAccepted(event.target.checked)} required type="checkbox" />
        <span>I have read and understand all the requirements above, and I acknowledge my commitment to prepare the selected food items.</span>
      </label>

      {loading ? <div className="status-message" role="status">Checking your submitted offering...</div> : null}
      {error ? <div className="field-error show" role="alert">{error}</div> : null}

      <div className="footer-actions">
        <button className={`action-button ${canSubmit ? "" : "disabled"}`} disabled={!canSubmit} type="submit">
          {saving ? "Submitting..." : loading ? "Checking Offering..." : "Submit Offering"}
        </button>
        <button className={`action-button secondary ${saving ? "disabled" : ""}`} disabled={saving} onClick={onBack} type="button">Back to Summary</button>
      </div>
    </form>
  );
}
