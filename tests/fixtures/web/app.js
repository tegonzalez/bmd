const status = document.querySelector('#app');
if (status) {
  status.textContent = 'bmd fixture loaded';
}

void import("./chunk-fixture.js").then((module) => {
  if (status) {
    status.dataset.chunk = module.chunkFixture;
  }
});
