// Simple proxy worker for file sharing using tmp.ninja
// This is a temporary solution until R2 is enabled

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Upload proxy
      if (url.pathname === '/upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Upload to tmp.ninja (temporary file hosting)
        const uploadFormData = new FormData();
        uploadFormData.append('files[]', file);
        
        const uploadResponse = await fetch('https://tmp.ninja/upload.php', {
          method: 'POST',
          body: uploadFormData
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload to tmp.ninja failed');
        }

        const result = await uploadResponse.json();
        
        if (result.files && result.files.length > 0) {
          const fileUrl = result.files[0].url;
          
          return new Response(JSON.stringify({
            success: true,
            url: fileUrl,
            fileName: file.name
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          throw new Error('No file URL returned');
        }
      }

      // Health check
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response('File Proxy Service - Active', {
          headers: corsHeaders
        });
      }

      return new Response('Not Found', { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Upload failed', 
        details: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};