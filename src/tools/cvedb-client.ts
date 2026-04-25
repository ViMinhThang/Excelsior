/**
 * This tool provides a client for querying the Open Source Vulnerabilities (OSV) database.
 * 
 * Implementation Details:
 * 1. Data Structures: Define interfaces for `PackageCoordinate` (ecosystem, name, version) and 
 *    `OsvAdvisory` (id, summary, severity, packageName).
 * 2. API Interaction: Implement `queryOsvPackages` to perform a batch query against the OSV API 
 *    (https://api.osv.dev/v1/querybatch).
 * 3. Request Formatting: Construct a JSON body containing a list of package queries, including 
 *    ecosystem and optional version.
 * 4. Response Parsing: Process the OSV response, mapping found vulnerabilities back to their 
 *    respective packages and extracting key details like advisory ID, summary, and severity.
 * 5. Error Handling: Ensure the function handles HTTP errors and returns an empty list if 
 *    no packages are provided or no vulnerabilities are found.
 */
