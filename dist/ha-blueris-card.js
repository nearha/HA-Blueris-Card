import "./blueiris-ui3-card.js";

const BlueIrisUi3Card = customElements.get("blueiris-ui3-card");
if (BlueIrisUi3Card) {
  BlueIrisUi3Card.getConfigElement = function getConfigElement() {
    return document.createElement("blueiris-ui3-card-editor");
  };
}

console.info("%c HA-BLUERIS-CARD %c editor patch loaded ", "color:white;background:#1565c0;font-weight:700", "color:#1565c0;background:white;font-weight:700");
