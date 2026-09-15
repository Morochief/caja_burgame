import { supabase } from '../supabase-client.js';

/**
 * Comprime una imagen en el cliente (max 800x800, WebP a 82% calidad)
 * reduciendo archivos pesados de 5-10MB a 40-70KB antes de transmitirse.
 */
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.82) {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.Image || !file.type.startsWith('image/')) {
            return resolve(file);
        }

        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => resolve(blob || file),
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

export async function uploadProductImage(file) {
    // 1. Optimizar imagen en el cliente antes de subir
    const compressedBlob = await compressImage(file);
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
    const filePath = `products/${fileName}`;

    // 2. Subir a Supabase Storage (product-images)
    const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressedBlob, {
            contentType: 'image/webp',
            cacheControl: '31536000', // 1 año cache en CDN
            upsert: false
        });

    if (error) {
        console.warn('Error subiendo a Supabase Storage, usando fallback optimizado:', error);
        // Fallback: almacenar data URL pero optimizada (solo 40-60KB en vez de 3MB)
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(compressedBlob);
        });
    }

    const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

    return publicUrl;
}

export const storageService = {
    uploadProductImage
};
