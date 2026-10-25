const SERVICE_INFO={
'आधार सेवाएँ':{services:[
{name:'Aadhaar Address Update',csc:0,govt:'₹75 (UIDAI fee; separate update)',docs:['Aadhaar number/card','Registered mobile','Valid address/identity proof'],process:['Address update requirement verify करें','Authorised Aadhaar workflow में details दर्ज करें','Required verification पूरा करें','Acknowledgement/receipt दें']},
{name:'Aadhaar Mobile Update',csc:0,govt:'UIDAI fee as applicable',docs:['Aadhaar number/card','New mobile number','Required identity/biometric verification'],process:['Mobile update request verify करें','Authorised Aadhaar workflow में request दर्ज करें','Verification पूरा करें','Acknowledgement दें']},
{name:'Aadhaar HOF Update',csc:0,govt:'UIDAI fee as applicable',docs:['Aadhaar details','HOF/relationship details','Required proof'],process:['HOF eligibility/relationship verify करें','Authorised Aadhaar workflow में request दर्ज करें','Verification पूरा करें','Acknowledgement दें']},
{name:'Aadhaar PVC Card',csc:0,govt:'₹75 (UIDAI PVC order, inclusive of GST & speed post)',docs:['Aadhaar number/VID','Registered mobile for OTP'],process:['PVC order details verify करें','Official portal order complete करें','Order/reference customer को दें']},
{name:'Aadhaar Lock / Unlock',csc:0,govt:'₹0 portal fee where applicable',docs:['Aadhaar/VID','Registered mobile','OTP'],process:['Lock/unlock requirement verify करें','Official UIDAI workflow पूरा करें','Confirmation/reference दें']},
{name:'Aadhaar VID',csc:0,govt:'₹0 portal fee where applicable',docs:['Aadhaar number','Registered mobile','OTP where required'],process:['VID generation/retrieval request verify करें','Official UIDAI workflow पूरा करें','VID/reference customer को दें']}
],process:['सही Aadhaar sub-service चुनें','Eligibility और documents verify करें','अधिकृत portal/centre process पूरा करें','Receipt/acknowledgement सुरक्षित रखें'],note:'Aadhaar की official UIDAI fee दिखायी गई है; authorised Aadhaar centre पर अतिरिक्त/मनमाना Aadhaar charge न जोड़ें。'},

'पैन सेवाएँ':{services:[
{name:'New PAN application',csc:50,govt:'₹107 (domestic physical PAN, portal charge)',docs:['Aadhaar/ID proof','Address proof','Date of birth proof','Photo/signature as required'],process:['PAN application type चुनें','KYC details भरें','Documents submit करें','Acknowledgement/reference दें']},
{name:'PAN correction / update',csc:50,govt:'₹107 (domestic physical PAN, portal charge)',docs:['Existing PAN','Corrected ID/address/DOB proof as applicable','Photo/signature if required'],process:['Existing PAN verify करें','Correction fields update करें','Documents submit करें','Acknowledgement रखें']},
{name:'PAN e-PAN download / print',csc:20,govt:'Portal charge as applicable',docs:['PAN number','Registered mobile/email as required'],process:['PAN details verify करें','Official portal से e-PAN प्राप्त करें','Print/download customer को दें']},
{name:'PAN reprint assistance',csc:40,govt:'Portal charge as applicable',docs:['PAN number','ID/KYC details as required'],process:['Reprint request verify करें','Portal request submit करें','Reference/receipt दें']}
],process:['PAN service type चुनें','KYC और documents verify करें','Authorised PAN portal process पूरा करें','Acknowledgement सुरक्षित रखें']},
'प्रमाण पत्र सेवाएँ':{services:[
{name:'Income Certificate application',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['ID proof','Address proof','Income proof/self-declaration as required'],process:['राज्य portal और eligibility verify करें','Form भरें','Documents upload करें','Application number दें']},
{name:'Caste Certificate application',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['ID proof','Address/residence proof','Caste/relationship/supporting records as applicable'],process:['Eligibility verify करें','Application भरें','Supporting documents submit करें','Status/reference दें']},
{name:'Residence / Domicile Certificate',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['ID proof','Residence proof','Local supporting document as applicable'],process:['Residence eligibility verify करें','Application submit करें','Acknowledgement/reference दें']},
{name:'Birth / Death Certificate assistance',csc:50,govt:'नगर/पोर्टल अनुसार',docs:['Applicant ID','Hospital/local record or registration details as applicable'],process:['Record details verify करें','Correction/application request भरें','Documents submit करें','Receipt/reference दें']}
],process:['संबंधित राज्य/स्थानीय portal और पात्रता verify करें','Form और documents submit करें','Application/reference सुरक्षित रखें']},
'बैंकिंग सेवाएँ':{services:[
{name:'Bank account opening assistance',csc:50,govt:'₹0 bank portal fee; bank terms apply',docs:['Aadhaar/ID','PAN where required','Mobile number','Address/KYC documents'],process:['Bank/product और KYC requirements verify करें','Authorised banking workflow में form भरें','KYC complete करें','Reference दें']},
{name:'Bank statement / transaction print',csc:20,govt:'Bank policy अनुसार',docs:['Account number/customer ID','ID proof where required'],process:['Account details verify करें','Authorised channel से statement प्राप्त करें','Print/reference दें']},
{name:'KYC / profile update assistance',csc:40,govt:'Bank policy अनुसार',docs:['Account details','Valid KYC/ID/address proof'],process:['Required update verify करें','Authorised bank workflow में submit करें','Acknowledgement दें']},
{name:'Banking form / service assistance',csc:30,govt:'Bank policy अनुसार',docs:['Account details','ID/KYC as applicable','Service-specific document'],process:['Service requirement समझें','Form/details भरें','Bank submission/reference दें']},
{name:'Banking & AEPS assistance',csc:50,govt:'Bank/BC policy अनुसार',docs:['Aadhaar/ID','Bank/BC customer details','Mobile number'],process:['Authorisation और eligibility verify करें','Authorised AEPS/BC workflow में transaction करें','Reference/receipt दें']},
{name:'NPCI Services',csc:30,govt:'Bank/NPCI process अनुसार',docs:['Bank account details','Aadhaar/mobile details as required'],process:['NPCI-related request identify करें','Authorised bank/NPCI workflow में submit करें','Reference दें']}
],process:['Bank/service eligibility verify करें','केवल अधिकृत banking/BC workflow का उपयोग करें','Transaction/reference सुरक्षित रखें'],note:'AEPS/BC/financial transactions तभी करें जब centre के पास वैध authorisation और live integration हो।'},
'किसान सेवाएँ':{services:[
{name:'PM-KISAN application/status assistance',csc:40,govt:'₹0 portal fee; eligibility applies',docs:['Aadhaar','Bank details','Land/farmer details as applicable'],process:['Eligibility verify करें','Farmer details भरें','Required records submit करें','Reference/status दें']},
{name:'Kisan / agriculture scheme application',csc:50,govt:'योजना/पोर्टल अनुसार',docs:['Aadhaar/ID','Land records','Bank details','Scheme-specific proof'],process:['Scheme eligibility check करें','Application भरें','Documents upload करें','Acknowledgement दें']},
{name:'Land / farmer record assistance',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['Land record/khata details','ID proof','Applicant details'],process:['Record identify करें','Portal request करें','Status/record copy दें']},
{name:'Farmer certificate / status assistance',csc:40,govt:'राज्य/पोर्टल अनुसार',docs:['Aadhaar/ID','Farmer/land records'],process:['Service verify करें','Application/status check करें','Reference/copy दें']}
],process:['योजना और eligibility verify करें','Farmer/land/bank details भरें','Documents submit करें','Reference सुरक्षित रखें']},
'बीमा सेवाएँ':{services:[
{name:'Insurance form assistance',csc:50,govt:'Insurer/product अनुसार',docs:['ID proof','Address proof','Policy/proposal details','Insurer-specific KYC'],process:['Product और requirement समझें','Details/documents verify करें','Authorised insurer workflow में submit करें']},
{name:'Policy renewal assistance',csc:40,govt:'Premium/insurer अनुसार',docs:['Policy number','ID/KYC as required','Renewal details'],process:['Policy status verify करें','Premium/terms customer से confirm करें','Authorised channel से renewal करें']},
{name:'Policy service request',csc:50,govt:'Insurer policy अनुसार',docs:['Policy number','ID proof','Request-specific documents'],process:['Request type verify करें','Documents submit करें','Reference/status दें']},
{name:'Claim documentation assistance',csc:75,govt:'Insurer/product अनुसार',docs:['Policy number','ID proof','Claim form','Incident/medical/death/other supporting records as applicable'],process:['Claim requirement list verify करें','Documents compile करें','Authorised insurer channel में submit करें','Claim reference दें']},
{name:'LIC Services',csc:40,govt:'LIC/product अनुसार',docs:['Policy number','Policyholder ID/KYC as required'],process:['LIC service requirement verify करें','Authorised LIC channel से request करें','Reference/receipt दें']}
],process:['Policy/product और insurer requirements verify करें','Documents complete करें','Authorised insurer portal/channel से request submit करें'],note:'Insurance premium, payout और insurer charges product/company के अनुसार बदलते हैं।'},
'टैक्स एवं GST':{services:[
{name:'GST registration assistance',csc:100,govt:'₹0 government portal fee',docs:['PAN','Aadhaar/ID','Business/address proof','Bank details','Photo/signature as applicable'],process:['Business details verify करें','GST application भरें','KYC/documents submit करें','ARN/reference दें']},
{name:'GST return filing assistance',csc:100,govt:'₹0 government portal fee',docs:['GSTIN','Sales/purchase data','Invoices','Login/authorised access'],process:['Period/data verify करें','Return details prepare करें','Portal filing complete करें','Acknowledgement रखें']},
{name:'GST amendment / profile update',csc:75,govt:'₹0 government portal fee where applicable',docs:['GSTIN','Changed business/KYC proof'],process:['Change verify करें','Amendment application भरें','Documents submit करें','ARN/status दें']},
{name:'Tax document / challan assistance',csc:50,govt:'Tax amount as calculated by portal',docs:['PAN/TAN/GST details','Challan/return details','Relevant financial data'],process:['Tax requirement identify करें','Portal calculation/check करें','Payment/filing customer approval से करें','Challan/reference दें']},
{name:'ITR Filing',csc:100,govt:'Income-tax portal fee as applicable',docs:['PAN','Aadhaar/ID','Income and tax documents','Bank details'],process:['Assessment year और filing type verify करें','Data/documents prepare करें','Authorised portal पर filing complete करें','Acknowledgement दें']},
{name:'MSME Registration',csc:75,govt:'Government portal fee as applicable',docs:['Aadhaar','PAN','Business details','Bank/contact details'],process:['Business details verify करें','Official Udyam/MSME registration process पूरा करें','Registration/reference दें']}
],process:['Tax/GST requirement identify करें','Data और documents verify करें','Official government portal process पूरा करें','ARN/challan/acknowledgement दें']},
'शिक्षा एवं छात्र':{services:[
{name:'Scholarship application assistance',csc:50,govt:'₹0 portal fee where applicable',docs:['Student ID','Aadhaar/ID','Marksheets','Bank details','Income/category proof as scheme requires'],process:['Scholarship eligibility check करें','Student form भरें','Documents upload करें','Application ID दें']},
{name:'Exam / admission form filling',csc:50,govt:'Exam/institute fee as applicable',docs:['Student ID','Photo/signature','Marksheets/certificates','Exam/admission details'],process:['Form और eligibility verify करें','Details भरें','Documents upload करें','Payment/reference दें']},
{name:'Certificate / marksheet download',csc:20,govt:'Portal/institute अनुसार',docs:['Roll number/enrolment number','DOB/login details as required'],process:['Record verify करें','Official portal से download करें','Print/copy दें']},
{name:'Education document print/scan',csc:10,govt:'₹0 portal fee',docs:['Original/digital document'],process:['Document receive करें','Scan/print करें','Customer को copy दें']}
],process:['Student service और deadline verify करें','Form/documents submit करें','Application/reference सुरक्षित रखें']},
'यातायात सेवाएँ':{services:[
{name:'Learner licence application assistance',csc:100,govt:'State transport portal fee as applicable',docs:['ID/address proof','DOB proof','Photo/signature as required'],process:['Eligibility verify करें','Official transport portal form भरें','Documents/fee process करें','Application/appointment reference दें']},
{name:'Driving licence application assistance',csc:100,govt:'State transport portal fee as applicable',docs:['ID/address proof','Learner licence details where required','Photo/signature'],process:['Licence service चुनें','Form और documents submit करें','Appointment/test instructions दें','Reference दें']},
{name:'DL renewal / duplicate assistance',csc:75,govt:'State transport portal fee as applicable',docs:['Existing DL','ID/address proof','Medical/other document where required'],process:['DL details verify करें','Renewal/duplicate request submit करें','Reference/receipt दें']},
{name:'Transport application / status assistance',csc:40,govt:'Portal अनुसार',docs:['Application number','Vehicle/DL details'],process:['Reference verify करें','Official portal status check करें','Status print दें']}
],process:['Service और state portal verify करें','Eligibility/documents check करें','Official transport portal पर application करें','Receipt/appointment details दें']},
'वाहन सेवाएँ':{services:[
{name:'Vehicle registration assistance',csc:100,govt:'State transport/RTO fee as applicable',docs:['Sale invoice','Insurance','ID/address proof','Form/dealer documents as applicable'],process:['Vehicle details verify करें','Registration application submit करें','Documents/fee process करें','Receipt/reference दें']},
{name:'RC transfer / ownership assistance',csc:100,govt:'RTO fee as applicable',docs:['RC','Buyer/seller ID','Sale/transfer documents','Insurance/PUC as applicable'],process:['RC and parties verify करें','Transfer application submit करें','Acknowledgement दें']},
{name:'RC download / print assistance',csc:30,govt:'Portal fee as applicable',docs:['Registration number','Vehicle owner details'],process:['Vehicle record verify करें','Official portal से RC copy प्राप्त करें','Print दें']},
{name:'Vehicle document / status assistance',csc:40,govt:'Portal/RTO अनुसार',docs:['Registration number','Relevant vehicle document'],process:['Record verify करें','Portal status/check करें','Reference दें']}
],process:['Vehicle records verify करें','RTO/transport portal workflow पूरा करें','Receipt/reference सुरक्षित रखें']},
'संपत्ति एवं भूमि':{services:[
{name:'Land record / RoR assistance',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['Khata/khasra/survey details','ID proof'],process:['Land record identify करें','Official portal से record प्राप्त करें','Print/reference दें']},
{name:'Mutation application assistance',csc:100,govt:'राज्य/तहसील fee as applicable',docs:['Registry/deed','ID proof','Land record','Supporting documents'],process:['Mutation eligibility verify करें','Application submit करें','Acknowledgement/reference दें']},
{name:'Property document application',csc:75,govt:'State registration/portal fee as applicable',docs:['Property details','ID proof','Registry/deed details'],process:['Document type identify करें','Official portal/office process करें','Receipt/reference दें']},
{name:'Land/property certificate assistance',csc:60,govt:'राज्य/पोर्टल अनुसार',docs:['Land/property records','ID/address proof'],process:['Certificate type verify करें','Application submit करें','Reference/copy दें']},
{name:'Bhulekh Print',csc:20,govt:'राज्य/भूलेख portal अनुसार',docs:['Khata/khasra/survey details','ID proof'],process:['Land record details verify करें','Official Bhulekh portal से record प्राप्त करें','Print/reference दें']}
],process:['Property/land details verify करें','State portal/office requirements follow करें','Application/reference सुरक्षित रखें']},
'कानूनी सेवाएँ':{services:[
{name:'Affidavit / declaration typing assistance',csc:50,govt:'Stamp/notary charges as applicable',docs:['ID proof','Address proof','Declaration details'],process:['Draft details verify करें','Document type/format तैयार करें','Stamp/notary requirement customer को बताएं']},
{name:'Legal application / form filling',csc:75,govt:'Court/office fee as applicable',docs:['ID proof','Case/application details','Supporting records'],process:['Form requirement समझें','Details भरें','Supporting documents attach करें','Receipt/reference दें']},
{name:'Document typing / print',csc:20,govt:'₹0 portal fee; stamp/notary extra if applicable',docs:['Source document/details'],process:['Content verify करें','Type/print करें','Final copy customer को दें']},
{name:'Status / reference assistance',csc:30,govt:'Office/portal अनुसार',docs:['Case/application/reference number','ID where required'],process:['Reference verify करें','Official portal/office status check करें','Status print दें']}
],process:['Service/document requirement स्पष्ट करें','कानूनी/सरकारी fee अलग होने पर customer को पहले बताएं','Final document/reference दें'],note:'यह centre assistance है; legal advice/representation के लिए authorised professional की आवश्यकता हो सकती है।'},
'स्वास्थ्य सेवाएँ':{services:[
{name:'Government health scheme application',csc:50,govt:'₹0 portal fee where applicable',docs:['Aadhaar/ID','Health scheme card/details','Income/category proof as applicable'],process:['Scheme eligibility verify करें','Application भरें','Documents submit करें','Reference दें']},
{name:'Health card / Ayushman assistance',csc:40,govt:'₹0 portal fee where applicable',docs:['Aadhaar/ID','Family/member details','Existing card if any'],process:['Eligibility/record verify करें','Authorised portal workflow पूरा करें','Card/reference दें']},
{name:'Hospital/health appointment assistance',csc:20,govt:'Hospital/portal fee as applicable',docs:['Patient ID','Hospital/department details'],process:['Hospital/service choose करें','Appointment details verify करें','Booking/reference दें']},
{name:'Health document print/download',csc:20,govt:'Portal/institution अनुसार',docs:['Patient/reference/login details'],process:['Record verify करें','Official source से document प्राप्त करें','Print दें']}
],process:['Health scheme/service identify करें','Patient details और documents verify करें','Authorised portal/institution process पूरा करें']},
'डिजिटल सेवाएँ':{services:[
{name:'Online form filling',csc:30,govt:'Portal fee as applicable',docs:['Service-specific ID/documents','Mobile number','Email where required'],process:['Form requirement verify करें','Data enter करें','Documents upload करें','Reference दें']},
{name:'Document scan / upload',csc:10,govt:'₹0 portal fee',docs:['Original document'],process:['Document scan करें','File size/format check करें','Portal पर upload करें']},
{name:'Online application status / download',csc:20,govt:'Portal fee as applicable',docs:['Application/reference number','Login/OTP details where required'],process:['Reference verify करें','Official portal status/download करें','Print/copy दें']},
{name:'Digital document print / copy',csc:10,govt:'₹0 portal fee',docs:['Digital document/file'],process:['File verify करें','Print/copy तैयार करें','Customer को दें']}
],process:['Digital service identify करें','Required data/documents verify करें','Official portal process पूरा करें','Acknowledgement/download दें']},
'अन्य नागरिक सेवाएँ':{services:[
{name:'Citizen online application',csc:40,govt:'Portal fee as applicable',docs:['Valid ID','Address proof','Service-specific documents'],process:['Service identify करें','Form भरें','Documents submit करें','Reference दें']},
{name:'Citizen certificate download',csc:20,govt:'Portal fee as applicable',docs:['Certificate/application number','ID where required'],process:['Record verify करें','Official portal से certificate प्राप्त करें','Print दें']},
{name:'Citizen form / document print',csc:15,govt:'₹0 portal fee',docs:['Digital form/document'],process:['File verify करें','Print करें','Customer को दें']},
{name:'General digital assistance',csc:30,govt:'Portal/service अनुसार',docs:['Service-specific details/documents'],process:['Request समझें','Official portal/service पूरा करें','Reference/receipt दें']},
{name:'Passport Services',csc:100,govt:'Passport fee as applicable',docs:['ID/address proof','DOB proof','Photo/other passport documents'],process:['Passport service type verify करें','Official passport portal form भरें','Appointment/documents process करें','Reference दें']},
{name:'Government Jobs',csc:50,govt:'Recruitment/exam fee as applicable',docs:['ID proof','Education certificates','Photo/signature','Job-specific documents'],process:['Recruitment notification और eligibility verify करें','Application form भरें','Documents/fee submit करें','Application reference दें']},
{name:'Complaint / Support',csc:20,govt:'Department/portal अनुसार',docs:['Complaint details','Application/reference number','Supporting document if required'],process:['Issue details verify करें','Official grievance/support channel पर request दर्ज करें','Complaint/reference number दें']}
],process:['Customer request और eligibility समझें','Official service/portal चुनें','Documents submit करें','Reference/receipt दें']},
'मोबाइल रिचार्ज':{services:[
{name:'Prepaid mobile recharge',csc:10,govt:'₹0 government fee; operator/offer terms apply',docs:['10-digit mobile number','Operator/plan confirmation'],process:['Number verify करें','Operator और plan/amount confirm करें','Customer payment लें','Transaction reference/receipt दें']},
{name:'Data / special plan recharge',csc:10,govt:'₹0 government fee; operator price as applicable',docs:['Mobile number','Selected plan'],process:['Plan details confirm करें','Payment लें','Recharge/reference दें']},
{name:'Recharge receipt / status assistance',csc:10,govt:'₹0 government fee',docs:['Mobile number','Transaction/reference if available'],process:['Transaction details verify करें','Status check करें','Receipt/reference दें']},
{name:'DTH Recharge',csc:10,govt:'₹0 government fee; operator price as applicable',docs:['DTH customer/registered mobile number','Operator and plan'],process:['Subscriber details verify करें','Plan/amount confirm करें','Customer payment लें','Transaction reference/receipt दें']}
],process:['Number और plan customer से confirm करें','Payment से पहले final amount बताएं','Transaction reference/receipt दें'],note:'यह project external recharge API के बिना manual workflow है; live recharge तभी होगा जब authorised recharge integration जोड़ी जाए।'},
'बिजली बिल भुगतान':{services:[
{name:'Electricity bill payment assistance',csc:10,govt:'Bill amount + portal/BBPS fee as applicable',docs:['Consumer number','Latest bill'],process:['Consumer number verify करें','Outstanding amount confirm करें','Customer approval/payment लें','Receipt/reference दें']},
{name:'Electricity bill download / print',csc:15,govt:'Portal अनुसार',docs:['Consumer number / bill'],process:['Consumer record verify करें','Bill प्राप्त करें','Print दें']},
{name:'Electricity payment receipt / status',csc:10,govt:'Portal/BBPS अनुसार',docs:['Consumer number','Payment reference if available'],process:['Payment/reference verify करें','Official source से status/receipt दें']}
],process:['Consumer number और final payable amount verify करें','Customer approval के बाद payment करें','Receipt/reference दें'],note:'इस version में live BBPS payment gateway नहीं है; payment को external gateway success न दिखाएँ।'},
'पानी बिल भुगतान':{services:[
{name:'Water bill payment assistance',csc:10,govt:'Bill amount + portal fee as applicable',docs:['Consumer number','Latest bill'],process:['Consumer number verify करें','Amount confirm करें','Payment लें','Receipt/reference दें']},
{name:'Water bill download / print',csc:15,govt:'Portal अनुसार',docs:['Consumer number / bill'],process:['Record verify करें','Bill download करें','Print दें']},
{name:'Water payment receipt / status',csc:10,govt:'Portal अनुसार',docs:['Consumer number','Payment reference if available'],process:['Reference verify करें','Status/receipt प्राप्त करें','Customer को दें']}
],process:['Consumer details verify करें','Amount customer से confirm करें','Payment/reference receipt दें']},
'यात्रा टिकट':{services:[
{name:'Bus ticket booking assistance',csc:50,govt:'Operator fare + booking fee as applicable',docs:['Passenger name','Journey date/route','ID where required'],process:['Route/date/seat verify करें','Fare customer को बताएं','Booking करें','Ticket/PNR दें']},
{name:'Train ticket booking assistance',csc:50,govt:'Rail fare + IRCTC/booking charges as applicable',docs:['Passenger ID/details as required','Journey details'],process:['Availability/fare verify करें','Passenger details confirm करें','Authorised booking workflow से ticket करें','PNR दें']},
{name:'Flight ticket booking assistance',csc:100,govt:'Airline fare + taxes/booking fee as applicable',docs:['Passenger name as per ID','Journey details','ID details where required'],process:['Flight/fare compare करें','Passenger details confirm करें','Booking करें','PNR/e-ticket दें']},
{name:'Ticket print / PNR status',csc:20,govt:'Portal/operator अनुसार',docs:['PNR/booking reference','Passenger details'],process:['Reference verify करें','Official source से status/ticket प्राप्त करें','Print दें']}
],process:['Journey details और passenger name verify करें','Fare/charges customer से पहले confirm करें','Booking के बाद ticket/PNR दें']},
'सरकारी योजना':{services:[
{name:'Scheme eligibility check',csc:20,govt:'₹0 portal fee where applicable',docs:['Aadhaar/ID','Income/category/family details as scheme requires'],process:['Scheme rules check करें','Customer details verify करें','Eligibility result/reference दें']},
{name:'Government scheme application',csc:50,govt:'योजना/पोर्टल अनुसार',docs:['Aadhaar/ID','Bank details','Income/category/other scheme-specific proof'],process:['Eligibility verify करें','Form भरें','Documents upload करें','Application reference दें']},
{name:'Scheme status / correction assistance',csc:30,govt:'Portal अनुसार',docs:['Application/reference number','ID/details'],process:['Reference verify करें','Status/correction option check करें','Updated reference दें']},
{name:'Scheme document upload / download',csc:20,govt:'Portal अनुसार',docs:['Application number','Required document'],process:['File verify करें','Portal upload/download करें','Acknowledgement दें']}
],process:['Scheme और eligibility verify करें','Application/documents submit करें','Reference/status customer को दें']},
'ई-गवर्नेंस सेवाएँ':{services:[
{name:'Government portal form filling',csc:40,govt:'Portal fee as applicable',docs:['ID proof','Mobile/email','Service-specific documents'],process:['Portal/service identify करें','Form भरें','Documents upload करें','Reference दें']},
{name:'Online certificate application',csc:50,govt:'State/portal अनुसार',docs:['ID/address proof','Certificate-specific documents'],process:['Certificate type verify करें','Application submit करें','Acknowledgement दें']},
{name:'Government status / download assistance',csc:20,govt:'Portal अनुसार',docs:['Application/reference number'],process:['Reference verify करें','Official portal से status/document प्राप्त करें','Print दें']},
{name:'Digital government document print',csc:15,govt:'₹0 portal fee where applicable',docs:['Digital document/reference'],process:['Document verify करें','Print/copy दें']}
],process:['Official government portal/service identify करें','Applicant details और documents verify करें','Application/status/download पूरा करें']},
'डाक एवं कुरियर':{services:[
{name:'Parcel booking assistance',csc:30,govt:'Post/courier tariff as applicable',docs:['Sender/receiver name/address/mobile','ID where required'],process:['Parcel details verify करें','Weight/charges confirm करें','Authorised booking करें','Receipt/tracking दें']},
{name:'Courier booking assistance',csc:30,govt:'Courier tariff as applicable',docs:['Sender/receiver details','ID where required'],process:['Courier service/charges confirm करें','Booking करें','Tracking/reference दें']},
{name:'Tracking assistance',csc:15,govt:'₹0 portal fee where applicable',docs:['Tracking number'],process:['Tracking number verify करें','Official courier/post portal पर status देखें','Status print/share करें']},
{name:'Packing / print support',csc:20,govt:'Material cost as applicable',docs:['Parcel/document'],process:['Packing requirement समझें','Material/print charge confirm करें','Parcel तैयार करें']},
{name:'Delivery Services',csc:30,govt:'Courier/post tariff as applicable',docs:['Sender/receiver details','Parcel/document','ID where required'],process:['Delivery requirement verify करें','Authorised delivery/courier service चुनें','Booking/dispatch करें','Tracking/reference दें']}
],process:['Sender/receiver details verify करें','Tariff/charges customer को बताएं','Booking receipt/tracking दें']},

'स्कूल / कॉलेज कार्य':{services:[
{name:'School / College Admission Form',csc:50,govt:'Institution/portal fee as applicable',docs:['Student details','Photo/signature','ID proof','Required academic documents'],process:['Institution/course और eligibility verify करें','Admission form भरें','Documents upload करें','Application/reference सुरक्षित रखें']},
{name:'Exam Form / Exam Fee Assistance',csc:40,govt:'Institution/university fee as applicable',docs:['Enrollment/registration number','Student ID','Exam/subject details'],process:['Exam details verify करें','Form और subjects confirm करें','Official portal/institution process पूरा करें','Acknowledgement दें']},
{name:'Admit Card Download / Print',csc:20,govt:'Portal अनुसार',docs:['Enrollment/registration number','DOB/login details as required'],process:['Student record verify करें','Official portal से admit card प्राप्त करें','Print/download दें']},
{name:'Result / Marksheet Download',csc:20,govt:'Portal अनुसार',docs:['Roll number/enrollment number','DOB/login details as required'],process:['Result details verify करें','Official source से result/marksheet प्राप्त करें','Print/download दें']},
{name:'Scholarship Application / Renewal',csc:50,govt:'Scheme/portal अनुसार',docs:['Student ID','Aadhaar/ID','Bank details','Income/category/academic documents as applicable'],process:['Scholarship eligibility verify करें','Application/renewal form भरें','Documents submit करें','Application reference दें']},
{name:'TC / Migration / Character / Bonafide Assistance',csc:40,govt:'Institution/university rules अनुसार',docs:['Student ID/enrollment','Institution records','Required application/document'],process:['Required certificate type confirm करें','Institution/official process के अनुसार request तैयार करें','Reference/acknowledgement दें']},
{name:'University Registration / Enrollment',csc:50,govt:'University fee as applicable',docs:['Admission/enrollment details','Academic documents','ID/photo/signature as required'],process:['University/course details verify करें','Registration form भरें','Documents submit करें','Registration/reference number दें']},
{name:'Revaluation / Rechecking / Back Paper Form',csc:40,govt:'University/institution fee as applicable',docs:['Roll/enrollment number','Result/marksheet','Subject details'],process:['Eligibility/deadline verify करें','Form भरें','Fee/payment process पूरा करें','Acknowledgement दें']},
{name:'Student Assignment / Project PDF Formatting',csc:50,govt:'₹0 portal fee; service charge applies',docs:['Source document/content','Student instructions','Images/data if applicable'],process:['Content और formatting requirement confirm करें','Document format करें','PDF तैयार करें','Final file customer को दें']},
{name:'Student Document Scan / Upload / Photo-Signature Resize',csc:20,govt:'₹0 portal fee; service charge applies',docs:['Original documents','Photo/signature files'],process:['Documents scan करें','Required size/format में तैयार करें','Official portal पर upload करें','Submission acknowledgement दें']}
],process:['School/college/university service और deadline verify करें','Student details/documents सही होने की पुष्टि करें','Official portal/institution workflow पूरा करें','Application/reference/receipt customer को दें'],note:'Institution और university rules, deadlines और fees अलग हो सकती हैं। Official portal/institution source से final requirements confirm करें।'} ,
'पेंशन सेवाएँ':{services:[
{name:'Pension application assistance',csc:75,govt:'राज्य/विभाग/पोर्टल अनुसार',docs:['Aadhaar/ID','Bank details','Age/service/pension records as applicable'],process:['Pension category verify करें','Application भरें','Documents submit करें','Reference दें']},
{name:'Pension status assistance',csc:30,govt:'₹0 portal fee where applicable',docs:['PPO/application number','ID where required'],process:['Reference verify करें','Official portal/department status check करें','Status print दें']},
{name:'Life certificate assistance',csc:50,govt:'Department/portal अनुसार',docs:['PPO/pension details','Aadhaar/ID','Biometric/verification where required'],process:['Pension record verify करें','Authorised verification workflow पूरा करें','Acknowledgement दें']},
{name:'Pension document print/download',csc:20,govt:'Portal अनुसार',docs:['PPO/reference/login details'],process:['Record verify करें','Official source से document प्राप्त करें','Print दें']}
],process:['Pension category और eligibility verify करें','Documents/records submit करें','Reference/acknowledgement सुरक्षित रखें']},
'परिवार रजिस्टर':{services:[
{name:'Family register application',csc:50,govt:'राज्य/स्थानीय portal अनुसार',docs:['Family ID/record if available','ID/address proof','Relationship proof'],process:['Family members details verify करें','Application भरें','Supporting records submit करें','Reference दें']},
{name:'Family member addition/update',csc:50,govt:'राज्य/स्थानीय portal अनुसार',docs:['Existing family record','New member ID','Relationship proof'],process:['Existing record verify करें','Update application submit करें','Acknowledgement दें']},
{name:'Family certificate assistance',csc:50,govt:'राज्य/पोर्टल अनुसार',docs:['Family record','ID/address proof','Relationship/death/other proof as applicable'],process:['Certificate type verify करें','Documents submit करें','Reference/certificate दें']},
{name:'Family register print/download',csc:20,govt:'Portal अनुसार',docs:['Family/application number','ID where required'],process:['Record verify करें','Official source से copy प्राप्त करें','Print दें']}
],process:['Family record और relationship details verify करें','State/local portal process पूरा करें','Reference/certificate दें']}
};

if (typeof module !== 'undefined' && module.exports) module.exports = SERVICE_INFO;

if (typeof window !== 'undefined') window.SERVICE_INFO = SERVICE_INFO;
