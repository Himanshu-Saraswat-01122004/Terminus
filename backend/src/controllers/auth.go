package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"

	"terminas-core/src/config"
	"terminas-core/src/models"
	"terminas-core/src/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type RegisterInput struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register handler
func Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if email already exists
	var existingUser models.User
	if err := config.DB.Where("email = ?", input.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt password"})
		return
	}

	user := models.User{
		Username: input.Username,
		Email:    input.Email,
		Password: string(hashedPassword),
	}

	if err := config.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Registration successful"})
}

// Login handler
func Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := config.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Generate JWT Token
	token, err := utils.GenerateToken(user.ID, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
		return
	}

	// Set JWT cookie
	c.SetCookie("token", token, 3600*24, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"role":     user.Role,
		},
	})
}

// Logout handler
func Logout(c *gin.Context) {
	c.SetCookie("token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// GetCurrentUser returns the profile of the logged-in user
func GetCurrentUser(c *gin.Context) {
	email, _ := c.Get("email")

	var user models.User
	if err := config.DB.Where("email = ?", email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":             user.ID,
			"username":       user.Username,
			"email":          user.Email,
			"role":           user.Role,
			"bio":            user.Bio,
			"billing_amount": user.BillingAmount,
		},
	})
}

// RedirectToGitHub redirects the client to GitHub's OAuth login page
func RedirectToGitHub(c *gin.Context) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	redirectURI := os.Getenv("GITHUB_REDIRECT_URI")

	githubURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=user:email",
		url.QueryEscape(clientID),
		url.QueryEscape(redirectURI),
	)

	c.Redirect(http.StatusTemporaryRedirect, githubURL)
}

// GitHubCallback handles authorization callback from GitHub
func GitHubCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth code missing"})
		return
	}

	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")

	// 1. Exchange OAuth code for Access Token
	tokenURL := "https://github.com/login/oauth/access_token"
	payload := fmt.Sprintf("client_id=%s&client_secret=%s&code=%s", clientID, clientSecret, code)
	req, _ := http.NewRequest("POST", tokenURL, bytes.NewBufferString(payload))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token exchange failed"})
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed parsing token response"})
		return
	}

	if tokenResp.AccessToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token received from GitHub"})
		return
	}

	// 2. Fetch User Profile
	profileReq, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	profileReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	profileResp, err := client.Do(profileReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load GitHub profile"})
		return
	}
	defer profileResp.Body.Close()

	var ghUser struct {
		Login string `json:"login"`
		Email string `json:"email"`
		Bio   string `json:"bio"`
	}
	json.NewDecoder(profileResp.Body).Decode(&ghUser)

	// 3. Fallback: Fetch emails if primary email is private
	if ghUser.Email == "" {
		emailReq, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
		emailReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
		emailResp, err := client.Do(emailReq)
		if err == nil {
			defer emailResp.Body.Close()
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if err := json.NewDecoder(emailResp.Body).Decode(&emails); err == nil {
				for _, e := range emails {
					if e.Primary && e.Verified {
						ghUser.Email = e.Email
						break
					}
				}
			}
		}
	}

	if ghUser.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub profile has no verified email address"})
		return
	}

	// 4. Handle signin/registration in database
	var user models.User
	err = config.DB.Where("email = ?", ghUser.Email).First(&user).Error
	if err != nil { // User doesn't exist, create account
		user = models.User{
			Username: ghUser.Login,
			Email:    ghUser.Email,
			Bio:      ghUser.Bio,
			Password: "oauth_placeholder_password", // Placeholder
		}
		if err := config.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed creating account"})
			return
		}
	}

	// 5. Generate session token
	token, err := utils.GenerateToken(user.ID, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Cookie injection
	c.SetCookie("token", token, 3600*24, "/", "", false, true)

	// Redirect to frontend dashboard (e.g. localhost:5173/oauth-success?token=...)
	c.Redirect(http.StatusTemporaryRedirect, "http://localhost:5173/oauth-success?token="+token)
}

// RedirectToGoogle redirects the client to Google's OAuth Page
func RedirectToGoogle(c *gin.Context) {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	redirectURI := os.Getenv("GOOGLE_REDIRECT_URI")

	googleURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=profile email",
		url.QueryEscape(clientID),
		url.QueryEscape(redirectURI),
	)

	c.Redirect(http.StatusTemporaryRedirect, googleURL)
}

// GoogleCallback handles Google OAuth redirection code exchange
func GoogleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth code missing"})
		return
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_REDIRECT_URI")

	// 1. Exchange code for Access Token
	tokenURL := "https://oauth2.googleapis.com/token"
	payload := url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}

	resp, err := http.PostForm(tokenURL, payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Google token exchange failed"})
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	json.NewDecoder(resp.Body).Decode(&tokenResp)

	if tokenResp.AccessToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid token received from Google"})
		return
	}

	// 2. Fetch User Profile
	profileURL := "https://www.googleapis.com/oauth2/v2/userinfo"
	req, _ := http.NewRequest("GET", profileURL, nil)
	req.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	client := &http.Client{}
	profileResp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed reading user profile"})
		return
	}
	defer profileResp.Body.Close()

	var gUser struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	json.NewDecoder(profileResp.Body).Decode(&gUser)

	if gUser.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Google profile missing verified email"})
		return
	}

	// 3. Handle user persistence
	var user models.User
	err = config.DB.Where("email = ?", gUser.Email).First(&user).Error
	if err != nil {
		user = models.User{
			Username: gUser.Name,
			Email:    gUser.Email,
			Password: "oauth_placeholder_password",
		}
		if err := config.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed creating account"})
			return
		}
	}

	// 4. Token Generation
	token, err := utils.GenerateToken(user.ID, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed creating session"})
		return
	}

	c.SetCookie("token", token, 3600*24, "/", "", false, true)
	c.Redirect(http.StatusTemporaryRedirect, "http://localhost:5173/oauth-success?token="+token)
}

// DownloadProfilePic loads raw byte buffer from user record
func DownloadProfilePic(c *gin.Context) {
	email := c.Param("email")
	var user models.User
	if err := config.DB.Where("email = ?", email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User profile not found"})
		return
	}

	if len(user.ProfilePic) == 0 {
		c.JSON(http.StatusNoContent, gin.H{})
		return
	}

	c.Data(http.StatusOK, "image/jpeg", user.ProfilePic)
}

// UploadProfilePic saves raw byte buffer to user record
func UploadProfilePic(c *gin.Context) {
	email, _ := c.Get("email")
	fileHeader, err := c.FormFile("profile_pic")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Profile picture file required"})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed opening uploaded file"})
		return
	}
	defer file.Close()

	buffer, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed processing file stream"})
		return
	}

	if err := config.DB.Model(&models.User{}).Where("email = ?", email).Update("profile_pic", buffer).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error updating profile picture"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile picture updated successfully"})
}
