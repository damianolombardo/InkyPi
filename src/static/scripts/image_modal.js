document.addEventListener('DOMContentLoaded', function() {
    const imageContainer = document.querySelector('.image-container');
    const img = imageContainer.querySelector('img');
    let modalOverlay = null;
    let modalImg = null;
    let observer = null;
    let ditherMode = false;

    if (!imageContainer || !img) return;

    async function fetchDisplayImage() {
        const response = await fetch('/api/current_display_image');
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    async function fetchDitheredImage(palette) {
        const url = palette ? `/api/dithered_image?palette=${palette}` : '/api/dithered_image';
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    // Handle click on image to show modal
    img.addEventListener('click', async function(e) {
        e.stopPropagation();
        ditherMode = false;

        // Wrapper so button sits above image
        modalOverlay = document.createElement('div');
        modalOverlay.className = 'image-modal-overlay';

        const wrapper = document.createElement('div');
        wrapper.className = 'image-modal-wrapper';

        modalImg = document.createElement('img');
        modalImg.src = img.src;

        // Dither toggle controls
        const controls = document.createElement('div');
        controls.className = 'image-modal-controls';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'image-modal-dither-btn';
        toggleBtn.textContent = 'Show Dithered';

        const paletteSelect = document.createElement('select');
        paletteSelect.className = 'image-modal-palette-select';
        paletteSelect.style.display = 'none';
        [
            { value: 'bw',    label: 'Black & White' },
            { value: 'bwr',   label: 'Black / White / Red' },
            { value: 'bwy',   label: 'Black / White / Yellow' },
            { value: 'ws6',   label: 'Waveshare Spectra 6' },
            { value: 'ws7',   label: 'Waveshare ACeP 7-colour' },
            { value: 'inky7', label: 'Inky 7-colour' },
        ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            paletteSelect.appendChild(opt);
        });

        async function applyDither() {
            toggleBtn.disabled = true;
            const src = await fetchDitheredImage(paletteSelect.value);
            if (src && modalImg) modalImg.src = src;
            toggleBtn.disabled = false;
        }

        async function applyNormal() {
            toggleBtn.disabled = true;
            const src = await fetchDisplayImage();
            if (src && modalImg) modalImg.src = src;
            toggleBtn.disabled = false;
        }

        toggleBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            ditherMode = !ditherMode;
            if (ditherMode) {
                toggleBtn.textContent = 'Show Normal';
                paletteSelect.style.display = '';
                await applyDither();
            } else {
                toggleBtn.textContent = 'Show Dithered';
                paletteSelect.style.display = 'none';
                await applyNormal();
            }
        });

        paletteSelect.addEventListener('change', async function(e) {
            e.stopPropagation();
            if (ditherMode) await applyDither();
        });

        // Pre-select palette based on server-detected default
        fetch('/api/dithered_image', { method: 'HEAD' }).then(r => {
            const p = r.headers.get('X-Palette');
            if (p) paletteSelect.value = p;
        }).catch(() => {});

        controls.appendChild(toggleBtn);
        controls.appendChild(paletteSelect);
        wrapper.appendChild(modalImg);
        wrapper.appendChild(controls);
        modalOverlay.appendChild(wrapper);
        document.body.appendChild(modalOverlay);
        imageContainer.classList.add('maximized');
        document.body.style.overflow = 'hidden';

        // Replace with the processed display image
        const displaySrc = await fetchDisplayImage();
        if (displaySrc && modalImg) {
            modalImg.src = displaySrc;
        }

        // Observe original image for src changes and refresh modal image
        observer = new MutationObserver(async function(mutations) {
            mutations.forEach(async function(mutation) {
                if (mutation.attributeName === 'src' && modalImg) {
                    if (ditherMode) {
                        await applyDither();
                    } else {
                        const src = await fetchDisplayImage();
                        if (src && modalImg) modalImg.src = src;
                    }
                }
            });
        });

        observer.observe(img, { attributes: true, attributeFilter: ['src'] });
    });

    // Handle click on overlay to close modal
    document.addEventListener('click', function(e) {
        if (imageContainer.classList.contains('maximized') && modalOverlay && !img.contains(e.target)) {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            modalOverlay.remove();
            modalOverlay = null;
            modalImg = null;
            ditherMode = false;
            imageContainer.classList.remove('maximized');
            document.body.style.overflow = '';
        }
    });
});
