from flask import Blueprint, request, jsonify, current_app, render_template, send_file
import io
import os
from datetime import datetime
from PIL import Image

main_bp = Blueprint("main", __name__)

@main_bp.route('/')
def main_page():
    device_config = current_app.config['DEVICE_CONFIG']
    return render_template('inky.html', config=device_config.get_config(), plugins=device_config.get_plugins())

@main_bp.route('/api/current_image')
def get_current_image():
    """Serve current_image.png with conditional request support (If-Modified-Since)."""
    image_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'images', 'current_image.png')
    
    if not os.path.exists(image_path):
        return jsonify({"error": "Image not found"}), 404
    
    # Get the file's last modified time (truncate to seconds to match HTTP header precision)
    file_mtime = int(os.path.getmtime(image_path))
    last_modified = datetime.fromtimestamp(file_mtime)
    
    # Check If-Modified-Since header
    if_modified_since = request.headers.get('If-Modified-Since')
    if if_modified_since:
        try:
            # Parse the If-Modified-Since header
            client_mtime = datetime.strptime(if_modified_since, '%a, %d %b %Y %H:%M:%S %Z')
            client_mtime_seconds = int(client_mtime.timestamp())
            
            # Compare (both now in seconds, no sub-second precision)
            if file_mtime <= client_mtime_seconds:
                return '', 304
        except (ValueError, AttributeError):
            pass
    
    # Send the file with Last-Modified header
    response = send_file(image_path, mimetype='image/png')
    response.headers['Last-Modified'] = last_modified.strftime('%a, %d %b %Y %H:%M:%S GMT')
    response.headers['Cache-Control'] = 'no-cache'
    return response


@main_bp.route('/api/current_display_image')
def get_current_display_image():
    """Serve current_display_image.png (post-processing) with conditional request support."""
    image_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'images', 'current_display_image.png')

    if not os.path.exists(image_path):
        # Fall back to the unprocessed image if the display image doesn't exist yet
        return get_current_image()

    file_mtime = int(os.path.getmtime(image_path))
    last_modified = datetime.fromtimestamp(file_mtime)

    if_modified_since = request.headers.get('If-Modified-Since')
    if if_modified_since:
        try:
            client_mtime = datetime.strptime(if_modified_since, '%a, %d %b %Y %H:%M:%S %Z')
            if file_mtime <= int(client_mtime.timestamp()):
                return '', 304
        except (ValueError, AttributeError):
            pass

    response = send_file(image_path, mimetype='image/png')
    response.headers['Last-Modified'] = last_modified.strftime('%a, %d %b %Y %H:%M:%S GMT')
    response.headers['Cache-Control'] = 'no-cache'
    return response


@main_bp.route('/api/dithered_image')
def get_dithered_image():
    """Serve a dithered version of the display image to preview hardware colour reduction."""
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'images')
    image_path = os.path.join(static_dir, 'current_display_image.png')
    if not os.path.exists(image_path):
        image_path = os.path.join(static_dir, 'current_image.png')
    if not os.path.exists(image_path):
        return jsonify({"error": "Image not found"}), 404

    device_config = current_app.config['DEVICE_CONFIG']
    display_type = device_config.get_config("display_type") or "mock"

    # Named palettes: list of (R, G, B) tuples
    PALETTES = {
        "bw":    [(0,0,0), (255,255,255)],
        "bwr":   [(0,0,0), (255,255,255), (255,0,0)],
        "bwy":   [(0,0,0), (255,255,255), (255,255,0)],
        "inky7": [(0,0,0), (255,255,255), (0,255,0), (0,0,255),
                  (255,0,0), (255,255,0), (255,140,0)],
    }

    # Pick palette based on display type (can be overridden via ?palette=)
    if display_type == "inky":
        default_palette = "inky7"
    else:
        default_palette = "bw"

    palette_key = request.args.get("palette", default_palette)
    colors = PALETTES.get(palette_key, PALETTES["bw"])

    image = Image.open(image_path).convert("RGB")

    palette_data = []
    for c in colors:
        palette_data.extend(c)
    palette_data += [0] * (256 * 3 - len(palette_data))

    palette_img = Image.new("P", (1, 1))
    palette_img.putpalette(palette_data)

    dithered = image.quantize(palette=palette_img, dither=Image.Dither.FLOYDSTEINBERG)
    result = dithered.convert("RGB")

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)

    response = send_file(buf, mimetype="image/png")
    response.headers["X-Palette"] = palette_key
    response.headers["Cache-Control"] = "no-store"
    return response


@main_bp.route('/api/plugin_order', methods=['POST'])
def save_plugin_order():
    """Save the custom plugin order."""
    device_config = current_app.config['DEVICE_CONFIG']

    data = request.get_json() or {}
    order = data.get('order', [])

    if not isinstance(order, list):
        return jsonify({"error": "Order must be a list"}), 400

    device_config.set_plugin_order(order)

    return jsonify({"success": True})