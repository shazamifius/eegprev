// utils/helpers.js

const handleDbError = (err, res) => {
    console.error(err);
    res.status(500).send("Une erreur interne est survenue.");
};

const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const [day, month, year] = birthdate.split('/');
    const birthDateObj = new Date(`${year}-${month}-${day}`);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const m = today.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
        age--;
    }
    return age;
};

const parsePortfolioLinks = (portfolioString) => {
    if (!portfolioString) {
        return [];
    }
    const urls = portfolioString.split(/[\n\r]+/).filter(line => line.trim() !== '');
    return urls.map(url => {
        try {
            // Ensure URL has a protocol
            let fullUrl = url;
            if (!/^https?:\/\//i.test(url)) {
                fullUrl = 'https://' + url;
            }
            const urlObject = new URL(fullUrl);
            let domain = urlObject.hostname.replace('www.', '');
            const name = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
            const icon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            return {
                url: fullUrl,
                name: name,
                icon: icon
            };
        } catch (e) {
            return null;
        }
    }).filter(item => item !== null);
};

module.exports = {
    handleDbError,
    calculateAge,
    parsePortfolioLinks
};
