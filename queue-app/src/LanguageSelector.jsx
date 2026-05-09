import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: "en", name: "🇬🇧 English" },
    { code: "hi", name: "🇮🇳 हिंदी" },
    { code: "mr", name: "🇮🇳 मराठी" },
  ];

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="fixed top-6 right-6 z-50 animate-fadeIn">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 text-white font-bold rounded-2xl border-2 border-white border-opacity-30 cursor-pointer hover:from-purple-700 hover:via-blue-700 hover:to-cyan-700 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-110 flex items-center gap-2"
          style={{
            boxShadow: '0 8px 30px rgba(102, 126, 234, 0.4)'
          }}
        >
          {languages.find(l => l.code === i18n.language)?.name}
          <svg 
            className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-3 bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-blue-200 animate-slideDown z-50 min-w-[200px]">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full text-left px-6 py-3 transition-all duration-200 font-semibold flex items-center gap-3 ${
                  i18n.language === lang.code
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                    : 'text-gray-700 hover:bg-blue-50 border-b border-gray-100'
                }`}
              >
                {lang.code === i18n.language && (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {lang.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
