import assert from "node:assert/strict";
import test from "node:test";
import {emailRetryDelayMs} from "../src/server/email-retry.ts";
import {escapeHtml,renderPasswordResetEmail,renderTeamInvitationEmail} from "../src/server/email-templates.ts";

test("team invitation email escapes HTML and strips newlines from subject headers",()=>{
 const rendered=renderTeamInvitationEmail({tenantName:"North <img src=x>\r\nBcc: thief@example.com",role:"sales & <admin>",acceptUrl:"https://shop.example/invite/a?x=1&y=2",expiresAt:"2026-10-08T12:00:00.000Z"});
 assert.equal(rendered.subject,"You're invited to join North <img src=x> Bcc: thief@example.com");
 assert.match(rendered.html,/North &lt;img src=x&gt; Bcc: thief@example\.com/);assert.match(rendered.html,/sales &amp; &lt;admin&gt;/);assert.match(rendered.html,/x=1&amp;y=2/);assert.equal(rendered.html.includes("\r"),false);assert.match(rendered.text,/https:\/\/shop\.example\/invite\/a\?x=1&y=2/);
});

test("HTML escaping encodes dangerous delimiters",()=>assert.equal(escapeHtml(`&<>"'`),"&amp;&lt;&gt;&quot;&#39;"));
test("email retry delay grows exponentially and caps at fifteen minutes",()=>{assert.equal(emailRetryDelayMs(1),30000);assert.equal(emailRetryDelayMs(2),60000);assert.equal(emailRetryDelayMs(3),120000);assert.equal(emailRetryDelayMs(99),900000)});

test("password reset email encodes its link, uses generic copy, and states one-time expiry",()=>{const email=renderPasswordResetEmail({resetUrl:'https://app.example.test/reset-password#<script>alert(1)</script>',expiresAt:'2026-10-06T12:30:00.000Z'});assert.match(email.subject,/reset your CommerceDesk password/i);assert.doesNotMatch(email.subject,/\r|\n/);assert.match(email.html,/&lt;script&gt;/);assert.match(email.html,/only be used once/i);assert.match(email.text,/expires/i)});
