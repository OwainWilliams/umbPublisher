<img src="assets/UmbracidianLogo.png" alt="Document Type" width="100px"></img> 
# Umbracidian - a plugin for Obsidian

This plugin allows you to push your [Obsidian](https://obsidian.md/) notes to [Umbraco 15+](https://umbraco.com) as a blog post. 

## Usage

Within Umbraco, you need to create a new document type for your blog posts. This document type should have the following properties as a minimum:
   - Title (string)
   - BlogContent (MarkdownEditor)
Make a note of the alias of the document type and also the alias of the properties. e.g. `obsidian`, `title`, `blogContent`. 

<img src="assets/docType.png" alt="Document Type"></img>
	
Within Umbraco, you will need to create a new API user. 



Within the Umbracidian settings tab, enter the URL of your Umbraco instance and the API key.
