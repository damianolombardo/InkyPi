document.addEventListener('DOMContentLoaded', function() {
    const imageContainer = document.querySelector('.image-container');
    const img = imageContainer.querySelector('img');
    let modalOverlay = null;
    let modalImg = null;
    let observer = null;
    
    if (!imageContainer || !img) return;

    async function fetchDisplayImage() {
        const response = await fetch('/api/current_display_image');
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    // Handle click on image to show modal
    img.addEventListener('click', async function(e) {
        e.stopPropagation();

        // Create overlay with image
        modalOverlay = document.createElement('div');
        modalOverlay.className = 'image-modal-overlay';

        modalImg = document.createElement('img');
        modalImg.src = img.src;
        modalOverlay.appendChild(modalImg);

        document.body.appendChild(modalOverlay);
        imageContainer.classList.add('maximized');
        document.body.style.overflow = 'hidden';

        // Replace with the processed display image
        const displaySrc = await fetchDisplayImage();
        if (displaySrc && modalImg) {
            modalImg.src = displaySrc;
        }

        // Observe original image for src changes and refresh display image
        observer = new MutationObserver(async function(mutations) {
            mutations.forEach(async function(mutation) {
                if (mutation.attributeName === 'src' && modalImg) {
                    const src = await fetchDisplayImage();
                    if (src && modalImg) modalImg.src = src;
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
            imageContainer.classList.remove('maximized');
            document.body.style.overflow = '';
        }
    });
});
