(function() {
    // Falls der Banner schon existiert
    if (document.getElementById('ts-cookie-banner')) return;

    // Consent aus localStorage laden
    const consent = JSON.parse(localStorage.getItem('ts-cookie-consent'));

    // --- DEINE FACEBOOK PIXEL ID HIER VERDECKT EINTRAGEN ---
    // Der Pixel feuert nur, wenn das Marketing-Consent erteilt wurde.
    const FB_PIXEL_ID = '923831920455008';

    // CSS für Cookie-Banner injizieren
    const style = document.createElement('style');
    style.innerHTML = `
        #ts-cookie-banner {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(11, 28, 45, 0.95);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-top: 1px solid rgba(82, 196, 183, 0.2);
            color: #EBF1F6;
            padding: 20px;
            z-index: 9999;
            font-family: 'DM Sans', sans-serif;
            display: flex;
            flex-direction: column;
            gap: 15px;
            box-shadow: 0 -10px 30px rgba(0,0,0,0.5);
            transform: translateY(100%);
            transition: transform 0.4s ease-in-out;
        }
        #ts-cookie-banner.visible {
            transform: translateY(0);
        }
        .ts-cookie-content h3 {
            margin: 0 0 10px 0;
            font-family: 'Source Serif 4', serif;
            color: #fff;
            font-size: 1.2rem;
        }
        .ts-cookie-content p {
            margin: 0;
            font-size: 0.9rem;
            color: rgba(255,255,255,0.7);
            line-height: 1.5;
        }
        .ts-cookie-content a {
            color: #52C4B7;
            text-decoration: underline;
        }
        .ts-cookie-settings {
            display: none;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        .ts-cookie-settings.open {
            display: block;
        }
        .ts-cookie-option {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        .ts-cookie-option input {
            margin-right: 10px;
            accent-color: #3BA89B;
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        .ts-cookie-option label {
            font-size: 0.9rem;
            font-weight: bold;
            cursor: pointer;
        }
        .ts-cookie-option span {
            display: block;
            font-size: 0.8rem;
            color: rgba(255,255,255,0.5);
            font-weight: normal;
        }
        .ts-cookie-buttons {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .ts-btn {
            padding: 10px 16px;
            border-radius: 6px;
            border: none;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.9rem;
            font-family: 'DM Sans', sans-serif;
            transition: all 0.3s ease;
            white-space: nowrap;
        }
        .ts-btn-primary {
            background: #3BA89B;
            color: #fff;
        }
        .ts-btn-primary:hover {
            background: #52C4B7;
        }
        .ts-btn-secondary {
            background: transparent;
            color: #EBF1F6;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .ts-btn-secondary:hover {
            background: rgba(255,255,255,0.05);
        }
        @media (min-width: 768px) {
            #ts-cookie-banner {
                flex-direction: row;
                align-items: flex-end;
                justify-content: space-between;
                padding: 20px 5%;
            }
            .ts-cookie-content {
                flex: 1;
                max-width: 650px;
            }
            .ts-cookie-buttons {
                flex-shrink: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // HTML Banner aufbauen
    const banner = document.createElement('div');
    banner.id = 'ts-cookie-banner';
    banner.innerHTML = `
        <div class="ts-cookie-content">
            <h3>Privatsphäre & Cookies</h3>
            <p>Wir nutzen Cookies, um dir das bestmögliche Erlebnis auf TeachSmarter zu bieten. Einige von ihnen sind essenziell, während andere uns helfen, diese Website und unser Marketing (z.B. Facebook Pixel) zu verbessern. Du kannst deine Auswahl jederzeit anpassen. Details findest du in unserer <a href="datenschutz.html">Datenschutzerklärung</a>.</p>
            
            <div class="ts-cookie-settings" id="ts-settings-panel">
                <div class="ts-cookie-option">
                    <input type="checkbox" id="cookie-necessary" checked disabled>
                    <label for="cookie-necessary">Notwendige Cookies <span>(Werden benötigt, damit die Seite grundlegend funktioniert)</span></label>
                </div>
                <div class="ts-cookie-option">
                    <input type="checkbox" id="cookie-marketing">
                    <label for="cookie-marketing">Marketing & Tracking <span>(Zur Erfolgsmessung von Kampagnen via Meta / Facebook)</span></label>
                </div>
            </div>
        </div>
        <div class="ts-cookie-buttons">
            <button class="ts-btn ts-btn-secondary" id="ts-btn-settings">Einstellungen bearbeiten</button>
            <button class="ts-btn ts-btn-secondary" id="ts-btn-necessary">Nur Notwendige</button>
            <button class="ts-btn ts-btn-primary" id="ts-btn-accept">Alle Akzeptieren</button>
        </div>
    `;
    document.body.appendChild(banner);

    const btnSettings = document.getElementById('ts-btn-settings');
    const btnNecessary = document.getElementById('ts-btn-necessary');
    const btnAccept = document.getElementById('ts-btn-accept');
    const settingsPanel = document.getElementById('ts-settings-panel');
    const chkMarketing = document.getElementById('cookie-marketing');

    // UI Logic: Banner Aktionen
    btnSettings.addEventListener('click', () => {
        if (settingsPanel.classList.contains('open')) {
            // Speichern
            saveConsent(chkMarketing.checked);
        } else {
            settingsPanel.classList.add('open');
            btnSettings.textContent = 'Auswahl speichern';
        }
    });

    btnNecessary.addEventListener('click', () => {
        saveConsent(false);
    });

    btnAccept.addEventListener('click', () => {
        saveConsent(true);
    });

    // Consent speichern
    function saveConsent(marketingGranted) {
        const c = { marketing: marketingGranted, timestamp: new Date().getTime() };
        localStorage.setItem('ts-cookie-consent', JSON.stringify(c));
        banner.classList.remove('visible');
        
        // Wenn akzeptiert, Pixel initieren
        if (marketingGranted) {
            initFacebookPixel();
        }
    }

    // Meta / Facebook Pixel Dynamischer Start
    function initFacebookPixel() {
        if (FB_PIXEL_ID === 'DEINE_PIXEL_ID_EINTRAGEN') {
            console.warn('TeachSmarter CookieBanner: Facebook Pixel ID fehlt. Ersetze "DEINE_PIXEL_ID_EINTRAGEN" im Skript.');
            return;
        }
        if (window.fbq) return; // Schon geladen

        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        
        fbq('init', FB_PIXEL_ID);
        fbq('track', 'PageView');
    }

    // Beim Laden prüfen
    if (!consent) {
        // Noch keine Entscheidung -> Banner hochfahren lassen
        setTimeout(() => banner.classList.add('visible'), 500);
    } else {
        // Bereits entschieden -> Marketing Status testen
        if (consent.marketing) {
            initFacebookPixel();
        }
    }

    // Globale Hilfsfunktion um die Cookies später nochmal zu widerrufen
    window.TeachSmarterResetCookies = function() {
        localStorage.removeItem('ts-cookie-consent');
        banner.classList.add('visible');
        settingsPanel.classList.remove('open');
        btnSettings.textContent = 'Einstellungen bearbeiten';
        chkMarketing.checked = false;
    };

})();
